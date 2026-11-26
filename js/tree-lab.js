/* =========================================================
   Forking-tree lab — interface.
   Build a forking tree, set a delay on every link, and compare
   vanilla OLS with vanilla NNLS on that one design.
   Needs js/tree-lab-engine.js loaded first.
   ========================================================= */
(function () {
  "use strict";
  const E = window.TreeLabEngine;
  const mount = document.getElementById("tree-lab");
  if (!E || !mount) return;

  const SVG = "http://www.w3.org/2000/svg";
  const MAX_NODES = 800;

  /* ---------- state ---------- */
  let nodes = [];                 // {id, parent, delay}
  let nextId = 0;
  let selected = null;            // node id
  let sim = { probes: 10, sigma: 0.01, seed: 1, zeroTol: 0.01, lassoAlpha: null, B: 100, pi0: 0.9, K: 4 };
  let linksAsRows = false;
  let fillSeed = 1;

  /* ---------- tree helpers ---------- */
  const byId = () => new Map(nodes.map(n => [n.id, n]));
  function childrenOf(id) { return nodes.filter(n => n.parent === id).map(n => n.id); }
  function rootId() { const r = nodes.find(n => n.parent === null); return r ? r.id : null; }
  function addNode(parent, delay) {
    const n = { id: nextId++, parent, delay: delay === undefined ? 0 : delay };
    nodes.push(n);
    return n.id;
  }
  function descendants(id) {
    const out = [], stack = [id];
    while (stack.length) {
      const u = stack.pop();
      for (const v of childrenOf(u)) { out.push(v); stack.push(v); }
    }
    return out;
  }
  function reset() { nodes = []; nextId = 0; addNode(null, 0); selected = null; }

  function quickBuild(layers, k, stem) {
    reset();
    let frontier = [rootId()];
    if (stem) frontier = [addNode(frontier[0], 0)];
    for (let d = 0; d < layers; d++) {
      const next = [];
      for (const u of frontier) for (let c = 0; c < k; c++) {
        if (nodes.length >= MAX_NODES) break;
        next.push(addNode(u, 0));
      }
      frontier = next;
    }
  }

  function randomFill(values, zeroShare) {
    const rng = E.mulberry32(97 * fillSeed++ + 13);
    nodes.forEach(n => {
      if (n.parent === null) return;
      n.delay = rng() < zeroShare ? 0 : values[Math.floor(rng() * values.length)];
    });
  }

  function loadExample() {
    // 4 layers, 2 children each below a root stem link, except two subtrees
    // that fork into 3 and 4 children.
    quickBuild(4, 2, true);
    const stem = childrenOf(rootId())[0];
    const layer1 = childrenOf(stem);
    const layer2 = childrenOf(layer1[1]);
    addNode(layer1[0], 0);                                   // a layer-1 router with 3 children
    const special = childrenOf(layer2[0])[1];                // a layer-3 router ...
    for (let c = 0; c < 4; c++) addNode(special, 0);         // ... that gets 4 children
    // Delays only on links into destinations, with at least one zero in every
    // group of sibling destinations: a pattern NNLS can recover exactly.
    const rng = E.mulberry32(11);
    const vals = [1, 0.5, 0.05];
    nodes.forEach(n => { n.delay = 0; });
    const parents = new Set(nodes.filter(n => n.parent !== null).map(n => n.parent));
    parents.forEach(u => {
      const leafKids = childrenOf(u).filter(v => !childrenOf(v).length);
      if (!leafKids.length) return;
      const zeroAt = Math.floor(rng() * leafKids.length);
      leafKids.forEach((v, i) => {
        byId().get(v).delay = i === zeroAt ? 0 : vals[Math.floor(rng() * vals.length)];
      });
    });
    selected = null;
  }

  /* ---------- sharing: compact text form of the design ---------- */
  function encodeDesign() {
    const D = E.buildDesign(nodes);
    const rid = rootId();
    const order = [rid, ...D.order];
    const pos = new Map(order.map((id, i) => [id, i]));
    const map = byId();
    return JSON.stringify({
      v: 1,
      parent: order.map(id => (map.get(id).parent === null ? -1 : pos.get(map.get(id).parent))),
      delay: order.map(id => Number(map.get(id).delay) || 0),
      sim,
    });
  }
  function decodeDesign(text) {
    const obj = JSON.parse(text);
    if (!obj || !Array.isArray(obj.parent) || !Array.isArray(obj.delay) ||
        obj.parent.length !== obj.delay.length || obj.parent[0] !== -1)
      throw new Error("That text is not a saved design.");
    if (obj.parent.length > MAX_NODES) throw new Error(`Designs are limited to ${MAX_NODES} routers.`);
    nodes = obj.parent.map((p, i) => ({ id: i, parent: p < 0 ? null : p, delay: Number(obj.delay[i]) || 0 }));
    if (nodes.some((n, i) => i > 0 && !(n.parent >= 0 && n.parent < i)))
      throw new Error("Every router must come after its parent in a saved design.");
    nextId = nodes.length;
    if (obj.sim) sim = Object.assign({}, sim, obj.sim);
    selected = null;
  }
  function toHash(text) {
    return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromHash(h) {
    const b = h.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4))));
  }

  /* ---------- formatting ---------- */
  const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v)) ? "—"
    : (Math.abs(v) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : v.toFixed(d));
  const pct = v => (v === null || v === undefined) ? "—" : (100 * v).toFixed(0) + "%";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm2 = v => Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  function parseNum(s) {
    const v = Number(String(s).trim());
    return Number.isFinite(v) ? v : null;
  }

  /* ---------- layout ---------- */
  mount.innerHTML = `
    <div class="lab-grid">
      <div class="lab-stage">
        <div class="lab-stage-head">
          <p class="eyebrow">Your forking tree</p>
          <p class="lab-stage-meta" id="lab-meta"></p>
        </div>
        <div class="lab-canvas" id="lab-canvas" aria-label="Forking tree; click a router to edit it"></div>
        <p class="lab-hint">Click a router to add children under it, remove its branch, or set the delay
          of the link leading into it. The root monitor is the square at the top; every leaf is a destination,
          so each root-to-leaf path is one probed route.</p>
      </div>

      <aside class="lab-panel" aria-label="Controls">
        <div class="lab-card">
          <p class="lab-card-title">Start from a regular tree</p>
          <div class="lab-row">
            <label for="lab-layers">Layers</label>
            <input id="lab-layers" type="number" min="1" max="8" value="4" />
            <label for="lab-k">Children each</label>
            <input id="lab-k" type="number" min="1" max="6" value="2" />
          </div>
          <label class="lab-check"><input id="lab-stem" type="checkbox" checked />
            Root stem link (monitor &rarr; first router)</label>
          <div class="lab-row lab-buttons">
            <button class="lab-btn lab-btn-primary" id="lab-build" type="button">Build tree</button>
            <button class="lab-btn" id="lab-example" type="button">Load example</button>
          </div>
        </div>

        <div class="lab-card" id="lab-selection"></div>

        <div class="lab-card">
          <p class="lab-card-title">Fill link delays</p>
          <div class="lab-row">
            <label for="lab-values">Values</label>
            <input id="lab-values" type="text" value="1, 0.5, 0.05" class="lab-wide" />
          </div>
          <div class="lab-row">
            <label for="lab-pattern">Which links are 0</label>
            <select id="lab-pattern" class="lab-wide">
              <option value="identifiable">Paper: topologically identifiable</option>
              <option value="sparse">Paper: identifiable + extra zeros</option>
              <option value="unidentifiable">Paper: no zeros (unidentifiable)</option>
              <option value="random">Random share of zeros</option>
            </select>
          </div>
          <div class="lab-row" id="lab-zero-row" hidden>
            <label for="lab-zero">Share set to 0</label>
            <input id="lab-zero" type="number" min="0" max="100" step="5" value="50" /><span class="lab-unit">%</span>
          </div>
          <div class="lab-row" id="lab-extra-row" hidden>
            <label for="lab-extra">Extra zeros, share of delayed links</label>
            <input id="lab-extra" type="number" min="0" max="100" step="5" value="50" /><span class="lab-unit">%</span>
          </div>
          <p class="lab-small" id="lab-pattern-note"></p>
          <div class="lab-row lab-buttons">
            <button class="lab-btn" id="lab-fill" type="button">Fill delays</button>
            <button class="lab-btn" id="lab-zeroall" type="button">Set all to 0</button>
          </div>
        </div>

        <details class="lab-card lab-details">
          <summary>Simulation settings</summary>
          <div class="lab-row">
            <label for="lab-probes">Probes per route</label>
            <input id="lab-probes" type="number" min="1" max="1000" step="1" />
          </div>
          <div class="lab-row">
            <label for="lab-sigma">Noise sd per probe</label>
            <input id="lab-sigma" type="number" min="0" step="0.005" />
          </div>
          <div class="lab-row">
            <label for="lab-seed">Noise seed</label>
            <input id="lab-seed" type="number" min="1" step="1" />
          </div>
          <div class="lab-row">
            <label for="lab-tol">Zero tolerance</label>
            <input id="lab-tol" type="number" min="0" step="0.005" />
          </div>
          <p class="lab-small">An estimate counts as zero when its size is at most the zero tolerance,
            and as positive when it is above it.</p>
          <div class="lab-row">
            <label for="lab-alpha">LASSO penalty &alpha;</label>
            <input id="lab-alpha" type="number" min="0" step="0.0005" placeholder="auto" />
          </div>
          <p class="lab-small">Leave blank for the automatic choice
            &alpha; = (&sigma;/&radic;m)&middot;&radic;(2 log p / n), the noise level of a route mean times the universal factor.</p>
          <div class="lab-row">
            <label for="lab-B">Stability subsamples B</label>
            <input id="lab-B" type="number" min="5" max="500" step="5" />
          </div>
          <div class="lab-row">
            <label for="lab-pi0">Stability cutoff &pi;<sub>0</sub></label>
            <input id="lab-pi0" type="number" min="0.05" max="1" step="0.05" />
          </div>
        </details>

        <div class="lab-card">
          <p class="lab-card-title">Save or share this design</p>
          <div class="lab-row lab-buttons">
            <button class="lab-btn" id="lab-copylink" type="button">Copy link</button>
            <button class="lab-btn" id="lab-copytext" type="button">Copy as text</button>
            <button class="lab-btn" id="lab-loadtoggle" type="button">Load from text</button>
          </div>
          <div id="lab-loadbox" hidden>
            <textarea id="lab-loadtext" rows="3" placeholder="Paste a design copied with “Copy as text”"></textarea>
            <div class="lab-row lab-buttons">
              <button class="lab-btn lab-btn-primary" id="lab-load" type="button">Load design</button>
            </div>
          </div>
          <p class="lab-small" id="lab-savemsg" aria-live="polite"></p>
        </div>
      </aside>
    </div>

    <div class="lab-block">
      <div class="lab-block-head">
        <p class="eyebrow">Link delays</p>
        <p class="lab-small">Type a delay for each link. Press Enter to move to the next one.
          Links are numbered top to bottom, left to right.</p>
      </div>
      <div class="lab-delays" id="lab-delays"></div>
    </div>

    <div class="lab-block" id="lab-results-wrap">
      <div class="lab-block-head lab-results-head">
        <p class="eyebrow">OLS, LASSO and NNLS on this design</p>
        <div class="lab-row lab-buttons">
          <label for="lab-K" class="lab-k-label">NDCG at K</label>
          <input id="lab-K" type="number" min="1" step="1" />
          <button class="lab-btn" id="lab-redraw" type="button">New noise draw</button>
          <button class="lab-btn" id="lab-orient" type="button">Show links as rows</button>
        </div>
      </div>
      <div id="lab-results"></div>
    </div>`;

  const $ = id => document.getElementById(id);

  /* ---------- drawing ---------- */
  function layout() {
    const rid = rootId();
    const pos = new Map();
    let leafX = 0, maxDepth = 0;
    (function place(u, depth) {
      maxDepth = Math.max(maxDepth, depth);
      const kids = childrenOf(u);
      if (!kids.length) { pos.set(u, { x: leafX++, d: depth }); return; }
      kids.forEach(v => place(v, depth + 1));
      const xs = kids.map(v => pos.get(v).x);
      pos.set(u, { x: (Math.min(...xs) + Math.max(...xs)) / 2, d: depth });
    })(rid, 0);
    return { pos, nLeaves: Math.max(1, leafX), maxDepth };
  }

  function delayColor(v) {
    if (!(v > 0)) return "var(--lab-zero)";
    return v >= 0.75 ? "var(--lab-hi)" : v >= 0.25 ? "var(--lab-mid)" : "var(--lab-lo)";
  }

  function draw() {
    const D = E.buildDesign(nodes);
    const { pos, nLeaves, maxDepth } = layout();
    const canvas = $("lab-canvas");
    const avail = Math.max(280, canvas.clientWidth - 2);
    const pad = 30, levelH = 84;
    const spacing = Math.max(30, Math.min(70, (avail - 2 * pad) / Math.max(1, nLeaves - 1)));
    const W = Math.max(avail, 2 * pad + spacing * (nLeaves - 1));
    const H = 2 * pad + levelH * maxDepth + 8;
    const X = p => (nLeaves === 1 ? W / 2 : pad + p.x * spacing);
    const Y = p => pad + p.d * levelH;
    const showLabels = nLeaves <= 40;

    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "lab-svg");

    const map = byId();
    const gEdges = document.createElementNS(SVG, "g");
    const gLabels = document.createElementNS(SVG, "g");
    const gNodes = document.createElementNS(SVG, "g");

    nodes.forEach(n => {
      if (n.parent === null) return;
      const a = pos.get(n.parent), b = pos.get(n.id);
      const isSel = n.id === selected;
      const line = document.createElementNS(SVG, "line");
      line.setAttribute("x1", X(a)); line.setAttribute("y1", Y(a));
      line.setAttribute("x2", X(b)); line.setAttribute("y2", Y(b));
      line.setAttribute("class", "lab-edge" + (isSel ? " is-selected" : ""));
      line.style.stroke = isSel ? "var(--trace)" : delayColor(n.delay);
      line.style.strokeWidth = isSel ? 4 : (n.delay > 0 ? 2.6 : 1.4);
      const hit = document.createElementNS(SVG, "line");
      ["x1", "y1", "x2", "y2"].forEach(k => hit.setAttribute(k, line.getAttribute(k)));
      hit.setAttribute("class", "lab-edge-hit");
      const t = document.createElementNS(SVG, "title");
      t.textContent = `${D.linkName.get(n.id)}: delay ${n.delay}`;
      hit.appendChild(t);
      hit.addEventListener("click", () => select(n.id));
      gEdges.appendChild(line); gEdges.appendChild(hit);

      if (showLabels || isSel) {
        // stagger sibling labels along their links so neighbours do not collide
        const sib = childrenOf(n.parent).indexOf(n.id);
        const tpos = childrenOf(n.parent).length > 1 ? (sib % 2 ? 0.7 : 0.45) : 0.5;
        const mx = X(a) + tpos * (X(b) - X(a)), my = Y(a) + tpos * (Y(b) - Y(a));
        const val = +Number(n.delay).toFixed(4);
        const txt = (spacing >= 58 || isSel) ? `${D.linkName.get(n.id)} · ${val}` : String(val);
        const g = document.createElementNS(SVG, "g");
        g.setAttribute("class", "lab-edge-label" + (isSel ? " is-selected" : "") + (n.delay > 0 ? "" : " is-zero"));
        const rect = document.createElementNS(SVG, "rect");
        const w = 7 + txt.length * 5.9;
        rect.setAttribute("x", mx - w / 2); rect.setAttribute("y", my - 8);
        rect.setAttribute("width", w); rect.setAttribute("height", 16); rect.setAttribute("rx", 3);
        const text = document.createElementNS(SVG, "text");
        text.setAttribute("x", mx); text.setAttribute("y", my + 3.6);
        text.textContent = txt;
        g.appendChild(rect); g.appendChild(text);
        g.addEventListener("click", () => select(n.id));
        gLabels.appendChild(g);
      }
    });

    nodes.forEach(n => {
      const p = pos.get(n.id);
      const g = document.createElementNS(SVG, "g");
      const isRoot = n.parent === null, isLeaf = !childrenOf(n.id).length && !isRoot;
      g.setAttribute("class", "lab-node" + (n.id === selected ? " is-selected" : "") +
                     (isRoot ? " is-root" : isLeaf ? " is-leaf" : ""));
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      const label = isRoot ? "Root monitor" : `Router at the end of ${D.linkName.get(n.id)}`;
      g.setAttribute("aria-label", label);
      let shape;
      if (isRoot) {
        shape = document.createElementNS(SVG, "rect");
        shape.setAttribute("x", X(p) - 10); shape.setAttribute("y", Y(p) - 10);
        shape.setAttribute("width", 20); shape.setAttribute("height", 20); shape.setAttribute("rx", 3);
      } else {
        shape = document.createElementNS(SVG, "circle");
        shape.setAttribute("cx", X(p)); shape.setAttribute("cy", Y(p));
        shape.setAttribute("r", isLeaf ? 6.5 : 8);
      }
      const t = document.createElementNS(SVG, "title");
      t.textContent = label;
      g.appendChild(t); g.appendChild(shape);
      g.addEventListener("click", () => select(n.id));
      g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(n.id); } });
      gNodes.appendChild(g);
    });

    svg.appendChild(gEdges); svg.appendChild(gLabels); svg.appendChild(gNodes);
    canvas.replaceChildren(svg);

    const p = D.order.length, nr = D.routes.length;
    $("lab-meta").textContent = `${p} link${p === 1 ? "" : "s"} · ${nr} route${nr === 1 ? "" : "s"} · longest route: ${maxDepth} link${maxDepth === 1 ? "" : "s"}`;
    return D;
  }

  /* ---------- selection panel ---------- */
  function select(id) { selected = id; refresh({ keepResults: true }); focusSelectedDelay(); }

  function renderSelection(D) {
    const box = $("lab-selection");
    if (selected === null || !byId().has(selected)) {
      box.innerHTML = `<p class="lab-card-title">Edit a router</p>
        <p class="lab-small">Click a router or a link in the tree to edit it here.</p>`;
      return;
    }
    const n = byId().get(selected);
    const isRoot = n.parent === null;
    const kids = childrenOf(n.id).length;
    const name = isRoot ? "Root monitor" : `Router after ${D.linkName.get(n.id)}`;
    box.innerHTML = `
      <p class="lab-card-title">${esc(name)}</p>
      <p class="lab-small">${kids ? kids + " child" + (kids === 1 ? "" : "ren") : "No children (a destination)"}${isRoot ? "" : " · layer " + D.depth.get(n.id)}</p>
      ${isRoot ? "" : `
      <div class="lab-row">
        <label for="lab-sel-delay">Delay on ${esc(D.linkName.get(n.id))}</label>
        <input id="lab-sel-delay" type="number" step="0.01" value="${esc(n.delay)}" />
      </div>
      <div class="lab-row lab-quick">
        ${[1, 0.5, 0.05, 0].map(v => `<button class="lab-chip" type="button" data-v="${v}">${v}</button>`).join("")}
      </div>`}
      <div class="lab-row">
        <label for="lab-sel-add">Add children</label>
        <input id="lab-sel-add" type="number" min="1" max="10" value="${kids ? 1 : 2}" />
        <button class="lab-btn lab-btn-primary" id="lab-sel-addbtn" type="button">Add</button>
      </div>
      ${kids ? `<div class="lab-row">
        <label for="lab-sel-below">Set every link below to</label>
        <input id="lab-sel-below" type="number" step="0.01" value="0" />
        <button class="lab-btn" id="lab-sel-belowbtn" type="button">Set</button>
      </div>` : ""}
      <div class="lab-row lab-buttons">
        ${isRoot ? "" : `<button class="lab-btn lab-btn-danger" id="lab-sel-del" type="button">Remove this branch</button>`}
        <button class="lab-btn" id="lab-sel-clear" type="button">Done</button>
      </div>`;

    if (!isRoot) {
      const inp = $("lab-sel-delay");
      const apply = () => { const v = parseNum(inp.value); if (v !== null) { n.delay = v; refresh({ keepPanel: true }); } };
      inp.addEventListener("change", apply);
      inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { apply(); stepSelection(D, 1); } });
      box.querySelectorAll(".lab-chip").forEach(b => b.addEventListener("click", () => {
        n.delay = Number(b.dataset.v); refresh();
      }));
      $("lab-sel-del").addEventListener("click", () => {
        const gone = new Set([n.id, ...descendants(n.id)]);
        nodes = nodes.filter(x => !gone.has(x.id));
        selected = n.parent;
        refresh();
      });
    }
    $("lab-sel-addbtn").addEventListener("click", () => {
      const k = Math.max(1, Math.min(10, Math.round(parseNum($("lab-sel-add").value) || 1)));
      if (nodes.length + k > MAX_NODES) { flash(`Designs are limited to ${MAX_NODES} routers.`); return; }
      for (let c = 0; c < k; c++) addNode(n.id, 0);
      refresh();
    });
    if (kids) $("lab-sel-belowbtn").addEventListener("click", () => {
      const v = parseNum($("lab-sel-below").value);
      if (v === null) return;
      descendants(n.id).forEach(id => { byId().get(id).delay = v; });
      refresh();
    });
    $("lab-sel-clear").addEventListener("click", () => { selected = null; refresh({ keepResults: true }); });
  }

  function stepSelection(D, dir) {
    const i = D.order.indexOf(selected);
    if (i >= 0 && i + dir >= 0 && i + dir < D.order.length) { selected = D.order[i + dir]; refresh({ keepResults: true }); focusSelectedDelay(); }
  }
  function focusSelectedDelay() {
    const inp = $("lab-sel-delay");
    if (inp) { inp.focus({ preventScroll: true }); inp.select(); }
  }

  /* ---------- delay editor ---------- */
  function renderDelays(D) {
    const box = $("lab-delays");
    const map = byId();
    box.innerHTML = D.order.map(id => `
      <label class="lab-delay${id === selected ? " is-selected" : ""}" data-id="${id}">
        <span>${esc(D.linkName.get(id))}</span>
        <input type="number" step="0.01" value="${esc(map.get(id).delay)}" data-id="${id}" aria-label="Delay on ${esc(D.linkName.get(id))}" />
      </label>`).join("");
    const inputs = [...box.querySelectorAll("input")];
    inputs.forEach((inp, i) => {
      const commit = () => {
        const v = parseNum(inp.value);
        if (v === null) { inp.value = map.get(Number(inp.dataset.id)).delay; return; }
        map.get(Number(inp.dataset.id)).delay = v;
        refresh({ keepDelays: true });
      };
      inp.addEventListener("change", commit);
      inp.addEventListener("keydown", ev => {
        if (ev.key === "Enter") { ev.preventDefault(); commit(); const nx = inputs[i + 1]; if (nx) { nx.focus(); nx.select(); } }
      });
      inp.addEventListener("focus", () => {
        box.querySelectorAll(".lab-delay").forEach(l => l.classList.toggle("is-selected", l.dataset.id === inp.dataset.id));
      });
    });
  }

  /* ---------- results ---------- */
  const EST = [
    { key: "ols",   name: "Vanilla OLS",             short: "OLS" },
    { key: "lasso", name: "Vanilla LASSO",           short: "LASSO" },
    { key: "nnls",  name: "Vanilla NNLS",            short: "NNLS" },
    { key: "ss",    name: "Stability-selected NNLS", short: "SS-NNLS" },
  ];
  let fitCache = { key: null, value: null };
  let ssCache = { key: null, value: null };
  let ssJob = null;                         // { key, state, timer }

  function designKey() {
    return JSON.stringify([nodes.map(n => [n.id, n.parent, Number(n.delay) || 0]),
                           sim.probes, sim.sigma, sim.seed, sim.lassoAlpha]);
  }

  // The SVD of the routing matrix depends only on the tree's shape.
  let svdCache = { key: null, value: null };
  let truthCache = { key: null, value: null };
  function getSvd(D) {
    const key = JSON.stringify(nodes.map(n => [n.id, n.parent]));
    if (svdCache.key !== key) svdCache = { key, value: E.svd(D.Xs) };
    return svdCache.value;
  }

  function getFits(D) {
    const key = designKey();
    if (fitCache.key !== key) fitCache = { key, value: E.simulate(D, Object.assign({}, sim, { svd: getSvd(D) })) };
    return fitCache.value;
  }

  // Stability selection runs in short slices so the page stays responsive.
  function stability(D, r) {
    const key = fitCache.key + "|" + sim.B + "|" + sim.pi0;
    if (ssCache.key === key) return { done: true, value: ssCache.value };
    if (!ssJob || ssJob.key !== key) {
      if (ssJob) clearTimeout(ssJob.timer);
      ssJob = { key, state: E.ssStart(D, r, { B: sim.B, pi0: sim.pi0, seed: sim.seed }), timer: null };
      const tick = () => {
        if (!ssJob || ssJob.key !== key) return;
        const finished = E.ssStep(ssJob.state, 30);
        const prog = document.getElementById("lab-ss-progress");
        if (prog) prog.textContent = `${ssJob.state.done} of ${ssJob.state.B} subsamples`;
        if (finished) {
          ssCache = { key, value: E.ssFinish(ssJob.state) };
          ssJob = null;
          if (fitCache.key + "|" + sim.B + "|" + sim.pi0 === key) renderResults(E.buildDesign(nodes));
        } else {
          ssJob.timer = setTimeout(tick, 0);
        }
      };
      ssJob.timer = setTimeout(tick, 0);
    }
    return { done: false, progress: ssJob.state.done, B: ssJob.state.B };
  }

  function renderResults(D) {
    const out = $("lab-results");
    if (!D.order.length) {
      out.innerHTML = `<p class="lab-empty">Add at least one link under the root monitor to run the comparison.</p>`;
      return;
    }
    if (!(sim.probes >= 1) || !(sim.sigma >= 0)) {
      out.innerHTML = `<p class="lab-empty">Set probes per route to 1 or more and the noise sd to 0 or more.</p>`;
      return;
    }
    let r;
    try { r = getFits(D); }
    catch (err) { out.innerHTML = `<p class="lab-empty">The fit could not be computed: ${esc(err.message)}</p>`; return; }
    const ss = stability(D, r);
    const est = { ols: r.ols, lasso: r.lasso, nnls: r.nnls, ss: ss.done ? ss.value.est : null };
    const avail = EST.filter(e => est[e.key]);
    const m = {}, nd = {};
    const K = Math.max(1, Math.min(Math.round(sim.K) || 1, r.beta.length));
    avail.forEach(e => { m[e.key] = E.metrics(r.beta, est[e.key], sim.zeroTol); nd[e.key] = E.ndcgAtK(r.beta, est[e.key], K); });

    const nSL = D.superLinks.length, nR = D.routes.length;
    // checks that depend only on the tree and its true delays, cached across noise draws
    const truthKey = JSON.stringify(nodes.map(n => [n.id, n.parent, Number(n.delay) || 0]));
    if (truthCache.key !== truthKey) {
      const topo = E.activeColumnsIndependent(D.Xs, r.beta);
      let identifiable = null;
      if (r.beta.every(v => v >= 0)) {
        try { identifiable = E.nnlsIsUnique(D.Xs, r.beta); } catch (e) { identifiable = null; }
      }
      const clean = D.Xs.map(row => row.reduce((t, a, j) => t + a * r.beta[j], 0));
      const olsExact = norm2(E.olsMinNorm(D.Xs, clean, getSvd(D)).map((v, j) => v - r.beta[j])) < 1e-8;
      truthCache = { key: truthKey, value: { topo, identifiable, olsExact, rank: E.rank(D.Xs) } };
    }
    const { topo, identifiable, olsExact, rank } = truthCache.value;

    const merged = D.superLinks.filter(s => s.ids.length > 1);
    const facts = [["Links", D.order.length], ["Super-links fitted", nSL], ["Routes", nR], ["Rank of design", `${rank} of ${nSL}`]];
    const notes = [];
    if (merged.length) notes.push(`Links that lie on exactly the same routes cannot be told apart, so each such group is fitted as one super-link whose true delay is the sum: ${merged.map(s => `<span class="lab-mono">${esc(s.label)}</span>`).join(", ")}.`);
    notes.push(rank < nSL
      ? `The design has more super-links than independent routes, so infinitely many delay vectors fit the route means equally well. Vanilla OLS returns the one with the smallest norm.`
      : `The design has full column rank, so OLS has a single solution.`);
    notes.push(topo.ok
      ? `<span class="lab-ok">Topologically identifiable:</span> the ${topo.nActive} delayed super-links have linearly independent columns, so &Sigma;<sub>SS</sub> is invertible (the paper's condition). Once the delayed set is found, its delays are determined.`
      : `<strong>Not topologically identifiable:</strong> the ${topo.nActive} delayed super-links have column rank ${topo.rank}, so &Sigma;<sub>SS</sub> is singular. Some delayed links can trade delay with each other without changing any route, typically a branching router whose outgoing links are all delayed.`);
    if (identifiable === true) notes.push(`<span class="lab-ok">Unique non-negative fit:</span> with noise-free route measurements, these true delays are the only non-negative vector that fits, so NNLS would recover them exactly${olsExact ? ", and so would OLS" : "; OLS would not, because it returns the minimum-norm fit"}.`);
    if (identifiable === false) notes.push(`Not a unique non-negative fit: even with noise-free route measurements, another non-negative delay vector fits exactly${topo.ok ? ", for example by moving part of a delayed link's delay onto all of the links below it" : ""}. This is a stronger requirement than the paper's condition.`);
    if (identifiable === null) notes.push(`Some true delays are negative, so the non-negative uniqueness check does not apply.`);

    const ssLine = ss.done
      ? `Stability selection: ${ss.value.stable.length} of ${nSL} super-links stable at &pi;<sub>0</sub> = ${sim.pi0} (B = ${ss.value.B}, c* = ${ss.value.cStar.toExponential(1)}), then refitted by NNLS on that set.`
      : `Stability selection is running: <span id="lab-ss-progress">${ss.progress} of ${ss.B} subsamples</span>. Its column fills in when it finishes.`;

    // reconstruction table
    const cols = D.superLinks;
    const cell = (v, kind) => {
      if (v === null || v === undefined) return `<td class="lab-num is-pending">…</td>`;
      const neg = v < -sim.zeroTol, zero = Math.abs(v) <= sim.zeroTol;
      return `<td class="lab-num${neg ? " is-neg" : ""}${zero ? " is-zero" : ""}${kind ? " " + kind : ""}">${fmt(v)}</td>`;
    };
    const estOf = (e, j) => (est[e.key] ? est[e.key][j] : null);
    let table;
    if (!linksAsRows) {
      table = `<table class="lab-table lab-recon">
        <thead><tr><th scope="col"></th>${cols.map(s => `<th scope="col" class="lab-mono">${esc(s.label)}</th>`).join("")}</tr></thead>
        <tbody>
          <tr class="is-truth"><th scope="row">True delay</th>${r.beta.map(v => cell(v)).join("")}</tr>
          ${EST.map(e => `<tr><th scope="row">${e.name}</th>${cols.map((_, j) => cell(estOf(e, j))).join("")}</tr>`).join("")}
        </tbody></table>`;
    } else {
      table = `<table class="lab-table lab-recon lab-recon-rows">
        <thead><tr><th scope="col">Super-link</th><th scope="col">True delay</th>${EST.map(e => `<th scope="col">${e.name}</th>`).join("")}</tr></thead>
        <tbody>${cols.map((s, j) => `<tr><th scope="row" class="lab-mono">${esc(s.label)}</th>${cell(r.beta[j], "is-truthcell")}${EST.map(e => cell(estOf(e, j))).join("")}</tr>`).join("")}</tbody></table>`;
    }

    // marks the best value(s) among the estimators that have finished
    const bestMarks = (vals, lowerWins) => {
      const ok = vals.filter(v => v !== null && v !== undefined && Number.isFinite(v));
      if (ok.length < 2 || lowerWins === null) return vals.map(() => "");
      const best = lowerWins ? Math.min(...ok) : Math.max(...ok);
      const allSame = ok.every(v => Math.abs(v - best) < 1e-9);
      return vals.map(v => (v !== null && v !== undefined && !allSame && Math.abs(v - best) < 1e-9 ? "is-better" : ""));
    };
    const rowCells = (vals, f, lowerWins) => {
      const marks = bestMarks(vals, lowerWins);
      return vals.map((v, i) => (v === undefined ? `<td class="lab-num is-pending">…</td>` : `<td class="lab-num ${marks[i]}">${f(v)}</td>`)).join("");
    };
    const pick = fn => EST.map(e => (m[e.key] ? fn(e.key) : undefined));

    const overallRows = [
      ["Signed support recovery", pick(k => m[k].overall.ssr), pct, false,
       "Share of super-links whose estimate has the true sign: positive for delayed links, zero (within the tolerance) for delay-free ones."],
      ["Relative L2 error", pick(k => m[k].overall.rl2), v => fmt(v), true,
       "‖estimate − truth‖ / ‖truth‖ over all super-links."],
      [`NDCG@${K}`, pick(k => nd[k].ndcg), v => fmt(v), false,
       `How well the ranking of the estimates puts the most delayed super-links first, over the top ${K}. Gains are the true delays; 1 is a perfect ranking. Tied estimates share a rank, and a tie at the cutoff brings in the whole tied group.`],
      [`Links counted in NDCG@${K}`, pick(k => nd[k].counted), v => String(v), null,
       `More than ${K} when estimates are tied at the cutoff.`],
      ["Recall", pick(k => m[k].overall.recall), pct, false,
       "Of the super-links with a true delay above 0, the share estimated above the zero tolerance."],
      ["Precision", pick(k => m[k].overall.precision), pct, false,
       "Of the super-links estimated above the zero tolerance, the share that truly have a delay."],
      ["Negative delay estimates", pick(k => m[k].overall.negatives), v => String(v), true,
       "Super-links estimated below −(zero tolerance): delays that cannot occur physically."],
      ["Most negative estimate", pick(k => m[k].overall.mostNegative), v => fmt(v), null, ""],
    ];
    const overall = `<table class="lab-table lab-metrics">
      <thead><tr><th scope="col">Metric</th>${EST.map(e => `<th scope="col">${e.name}</th>`).join("")}<th scope="col" class="lab-def-col">What it measures</th></tr></thead>
      <tbody>${overallRows.map(([name, vals, f, low, def]) =>
        `<tr><th scope="row">${name}</th>${rowCells(vals, f, low)}<td class="lab-def">${def}</td></tr>`).join("")}</tbody></table>`;

    // per-bin metrics
    const binsOf = k => m[k].bins;
    const binRows = m.ols.bins.map((bo, i) => {
      const grp = (fn, f, low) => rowCells(EST.map(e => (m[e.key] ? fn(binsOf(e.key)[i]) : undefined)), f, low);
      return `<tr><th scope="row" class="lab-mono">${fmt(bo.value, 3)}</th><td class="lab-num">${bo.n}</td>
        ${grp(b => b.ssr, pct, false)}${grp(b => b.rl2, v => fmt(v), true)}
        ${grp(b => b.recall, pct, false)}${grp(b => b.precision, pct, false)}</tr>`;
    }).join("");
    const subHead = EST.map(e => `<th scope="col">${e.short}</th>`).join("");
    const bins = `<table class="lab-table lab-bins">
      <thead>
        <tr><th scope="col" rowspan="2">True delay</th><th scope="col" rowspan="2">Super-links</th>
          <th scope="colgroup" colspan="4">Signed support recovery</th><th scope="colgroup" colspan="4">Relative L2</th>
          <th scope="colgroup" colspan="4">Recall (value band)</th><th scope="colgroup" colspan="4">Precision (value band)</th></tr>
        <tr>${subHead.repeat(4)}</tr>
      </thead><tbody>${binRows}</tbody></table>`;

    out.innerHTML = `
      <div class="lab-facts">${facts.map(([k, v]) => `<div><p class="lab-fact-k">${k}</p><p class="lab-fact-v">${v}</p></div>`).join("")}</div>
      <div class="lab-notes">${notes.map(n => `<p>${n}</p>`).join("")}</div>
      <p class="lab-small">One simulated experiment: ${sim.probes} probe${sim.probes == 1 ? "" : "s"} per route, noise sd ${sim.sigma} per probe, seed ${sim.seed}.
        OLS, LASSO and NNLS are fitted to the same route-mean delays on the 0/1 routing matrix with no weights;
        LASSO uses &alpha; = ${r.alpha.toPrecision(3)}${sim.lassoAlpha === null ? " (automatic)" : ""}.
        Stability-selected NNLS follows the paper: route weights m/v&#770;, within-route half-subsamples, selection over the c-grid, and a non-negative refit on the stable set.</p>
      <p class="lab-small">${ssLine}</p>

      <h3 class="lab-h3">Reconstructed delays</h3>
      <p class="lab-small">Values below −${sim.zeroTol} are <span class="lab-neg-key">highlighted</span>; values within ±${sim.zeroTol} of zero are dimmed.</p>
      <div class="lab-scroll">${table}</div>

      <h3 class="lab-h3">Overall</h3>
      <div class="lab-scroll">${overall}</div>

      <h3 class="lab-h3">By true delay value</h3>
      <div class="lab-scroll">${bins}</div>
      <p class="lab-small">Each row groups the super-links with that true delay. Signed support recovery and relative L2 are
        computed on that group (relative L2 divides by ‖truth‖ over all super-links, so rows add up in squares to the overall value).
        For the value-band columns every estimate is assigned to the nearest true delay value in this design (or 0):
        recall is the share of the group assigned to its own value, precision is the share of links assigned to that value
        that truly have it. The best estimator is <span class="is-better-key">marked</span> on each row where they differ.</p>`;
  }


  /* ---------- refresh & controls ---------- */
  let lastFlash = 0;
  function flash(msg) { $("lab-savemsg").textContent = msg; lastFlash = Date.now(); }

  function syncSimInputs() {
    $("lab-probes").value = sim.probes; $("lab-sigma").value = sim.sigma;
    $("lab-seed").value = sim.seed; $("lab-tol").value = sim.zeroTol;
    $("lab-alpha").value = sim.lassoAlpha === null ? "" : sim.lassoAlpha;
    $("lab-B").value = sim.B; $("lab-pi0").value = sim.pi0; $("lab-K").value = sim.K;
  }

  function refresh(opts) {
    opts = opts || {};
    const D = draw();
    if (!opts.keepPanel) renderSelection(D);
    if (!opts.keepDelays) renderDelays(D);
    renderResults(D);
    $("lab-orient").textContent = linksAsRows ? "Show links as columns" : "Show links as rows";
  }

  const PATTERN_NOTE = {
    identifiable: "At every branching router below the root, one outgoing link is set to 0 at random (the paper's fork condition). Links out of the root monitor always keep a delay. Delayed links share the values evenly.",
    sparse: "Topologically identifiable first, then this share of the remaining delayed links is also set to 0 at random. Links out of the root monitor always keep a delay.",
    unidentifiable: "Every link gets a delay; the values are shared evenly.",
    random: "Each link is set to 0 with this probability, otherwise it gets one of the values at random.",
  };
  function syncPatternUI() {
    const mode = $("lab-pattern").value;
    $("lab-zero-row").hidden = mode !== "random";
    $("lab-extra-row").hidden = mode !== "sparse";
    $("lab-pattern-note").textContent = PATTERN_NOTE[mode];
  }
  $("lab-pattern").addEventListener("change", syncPatternUI);

  // Fill delays with the chosen pattern. Returns false (with a message) on bad input.
  function fillDelays() {
    const vals = $("lab-values").value.split(/[,\s]+/).filter(t => t !== "").map(parseNum).filter(v => v !== null);
    if (!vals.length) { flash("Enter at least one value to fill with, for example 1, 0.5, 0.05."); return false; }
    const mode = $("lab-pattern").value;
    if (mode === "random") {
      const z = Math.max(0, Math.min(100, parseNum($("lab-zero").value) || 0)) / 100;
      randomFill(vals, z);
    } else {
      const extra = Math.max(0, Math.min(100, parseNum($("lab-extra").value) || 0));
      const m = E.paperDelays(nodes, mode, extra, vals, 7919 * fillSeed++ + 1);
      nodes.forEach(n => { if (n.parent !== null) n.delay = m.get(n.id); });
    }
    return true;
  }

  $("lab-build").addEventListener("click", () => {
    const L = Math.max(1, Math.min(8, Math.round(parseNum($("lab-layers").value) || 1)));
    const k = Math.max(1, Math.min(6, Math.round(parseNum($("lab-k").value) || 1)));
    const total = (k === 1 ? L : (Math.pow(k, L + 1) - 1) / (k - 1)) + 1;
    if (total > MAX_NODES) { flash(`That tree has ${total} routers; the limit is ${MAX_NODES}. Use fewer layers or children.`); return; }
    quickBuild(L, k, $("lab-stem").checked);
    fillDelays();
    refresh();
  });
  $("lab-example").addEventListener("click", () => { loadExample(); refresh(); });
  $("lab-fill").addEventListener("click", () => { if (fillDelays()) refresh(); });
  $("lab-zeroall").addEventListener("click", () => { nodes.forEach(n => { n.delay = 0; }); refresh(); });

  [["lab-probes", "probes", v => Math.max(1, Math.round(v))], ["lab-sigma", "sigma", v => Math.max(0, v)],
   ["lab-seed", "seed", v => Math.max(1, Math.round(v))], ["lab-tol", "zeroTol", v => Math.max(0, v)],
   ["lab-B", "B", v => Math.max(5, Math.min(500, Math.round(v)))], ["lab-pi0", "pi0", v => Math.max(0.05, Math.min(1, v))],
   ["lab-K", "K", v => Math.max(1, Math.round(v))]]
    .forEach(([id, key, clean]) => $(id).addEventListener("change", () => {
      const v = parseNum($(id).value);
      if (v !== null) sim[key] = clean(v);
      syncSimInputs();
      refresh({ keepPanel: true, keepDelays: true });
    }));

  $("lab-alpha").addEventListener("change", () => {
    const raw = $("lab-alpha").value.trim();
    const v = raw === "" ? null : parseNum(raw);
    sim.lassoAlpha = v === null ? null : Math.max(0, v);
    syncSimInputs();
    refresh({ keepPanel: true, keepDelays: true });
  });
  $("lab-redraw").addEventListener("click", () => { sim.seed += 1; syncSimInputs(); refresh({ keepPanel: true, keepDelays: true }); });
  $("lab-orient").addEventListener("click", () => { linksAsRows = !linksAsRows; refresh({ keepPanel: true, keepDelays: true }); });

  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); flash(okMsg); }
    catch (e) {
      $("lab-loadbox").hidden = false;
      $("lab-loadtext").value = text; $("lab-loadtext").select();
      flash("Copying is blocked here, so the text is selected in the box below. Copy it with your keyboard.");
    }
  }
  $("lab-copylink").addEventListener("click", () => {
    const url = location.href.split("#")[0] + "#" + toHash(encodeDesign());
    try { history.replaceState(null, "", url); } catch (e) { /* ignore */ }
    copyText(url, "Link copied. Opening it restores this design and its settings.");
  });
  $("lab-copytext").addEventListener("click", () => copyText(encodeDesign(), "Design copied as text."));
  $("lab-loadtoggle").addEventListener("click", () => { $("lab-loadbox").hidden = !$("lab-loadbox").hidden; });
  $("lab-load").addEventListener("click", () => {
    try { decodeDesign($("lab-loadtext").value.trim()); syncSimInputs(); refresh(); flash("Design loaded."); }
    catch (e) { flash(e.message.startsWith("That") || e.message.startsWith("Every") || e.message.startsWith("Designs") ? e.message : "That text is not a saved design."); }
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => draw(), 150); });

  /* ---------- start ---------- */
  let loaded = false;
  if (location.hash.length > 1) {
    try { decodeDesign(fromHash(location.hash.slice(1))); loaded = true; } catch (e) { loaded = false; }
  }
  if (!loaded) loadExample();
  syncPatternUI();
  syncSimInputs();
  refresh();
})();
