/* =========================================================
   Hero network — a visual statement of network tomography.

   Terminal (leaf) nodes are observable; interior nodes and the
   links between them are not. Probes travel leaf-to-leaf and
   light the path they cross, which is the only evidence the
   interior ever gives you.
   ========================================================= */

(function () {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    signal:    (css.getPropertyValue('--signal') || '#7C8CFF').trim(),
    signalDim: (css.getPropertyValue('--signal-dim') || '#4A55A8').trim(),
    trace:     (css.getPropertyValue('--trace') || '#F2B441').trim(),
    line:      (css.getPropertyValue('--line') || '#222736').trim(),
    ink:       (css.getPropertyValue('--ink') || '#0B0D12').trim()
  };

  /* --- Topology. Fixed coordinates so the figure always composes well. --- */
  const NODES = [
    // interior — unobserved
    { x: 0.50, y: 0.50, leaf: false },
    { x: 0.31, y: 0.36, leaf: false },
    { x: 0.69, y: 0.34, leaf: false },
    { x: 0.34, y: 0.68, leaf: false },
    { x: 0.70, y: 0.67, leaf: false },
    // terminals — observed
    { x: 0.12, y: 0.19, leaf: true },
    { x: 0.36, y: 0.09, leaf: true },
    { x: 0.66, y: 0.08, leaf: true },
    { x: 0.89, y: 0.19, leaf: true },
    { x: 0.93, y: 0.52, leaf: true },
    { x: 0.81, y: 0.88, leaf: true },
    { x: 0.44, y: 0.92, leaf: true },
    { x: 0.11, y: 0.75, leaf: true },
    { x: 0.07, y: 0.45, leaf: true }
  ];

  const EDGES = [
    // interior links
    [1, 0], [2, 0], [3, 0], [4, 0], [1, 2], [3, 4],
    // access links to terminals
    [5, 1], [6, 1], [13, 1],
    [7, 2], [8, 2], [9, 2],
    [10, 4], [4, 9],
    [11, 3], [12, 3]
  ];

  const LEAVES = NODES.map((n, i) => (n.leaf ? i : -1)).filter(i => i >= 0);

  // adjacency + edge lookup
  const adj = NODES.map(() => []);
  const edgeIndex = new Map();
  EDGES.forEach(([a, b], i) => {
    adj[a].push(b);
    adj[b].push(a);
    edgeIndex.set(a + ':' + b, i);
    edgeIndex.set(b + ':' + a, i);
  });

  function shortestPath(start, goal) {
    const prev = new Array(NODES.length).fill(-1);
    const seen = new Array(NODES.length).fill(false);
    const queue = [start];
    seen[start] = true;
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const next of adj[cur]) {
        if (!seen[next]) {
          seen[next] = true;
          prev[next] = cur;
          queue.push(next);
        }
      }
    }
    const path = [];
    let at = goal;
    while (at !== -1) {
      path.unshift(at);
      at = prev[at];
    }
    return path[0] === start ? path : [];
  }

  /* --- State --- */
  const edgeHeat = new Float32Array(EDGES.length);
  const nodeHeat = new Float32Array(NODES.length);
  const probes = [];
  let size = 0;
  let pad = 0;
  let pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    size = Math.max(rect.width, 1);
    pad = size * 0.09;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pos(i) {
    const span = size - pad * 2;
    const drift = NODES[i].leaf ? 5 : 9; // interior drifts more — it's the uncertain part
    return {
      x: pad + NODES[i].x * span + pointer.x * drift,
      y: pad + NODES[i].y * span + pointer.y * drift
    };
  }

  function spawnProbe() {
    let a = LEAVES[(Math.random() * LEAVES.length) | 0];
    let b = LEAVES[(Math.random() * LEAVES.length) | 0];
    let guard = 0;
    while (b === a && guard++ < 12) b = LEAVES[(Math.random() * LEAVES.length) | 0];
    const path = shortestPath(a, b);
    if (path.length < 2) return;
    probes.push({ path, t: 0, speed: 0.34 + Math.random() * 0.2 });
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  let last = performance.now();
  let sinceSpawn = 0;

  function frame(now) {
    // rAF hands back the frame-start timestamp, which can precede the value we
    // captured at load. Clamp so dt is never negative (that ran probes backwards).
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;

    // ease pointer parallax
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    // decay heat
    for (let i = 0; i < edgeHeat.length; i++) edgeHeat[i] = Math.max(0, edgeHeat[i] - dt * 0.85);
    for (let i = 0; i < nodeHeat.length; i++) nodeHeat[i] = Math.max(0, nodeHeat[i] - dt * 1.1);

    // advance probes
    sinceSpawn += dt;
    if (sinceSpawn > 0.85 && probes.length < 4) {
      sinceSpawn = 0;
      spawnProbe();
    }

    for (let p = probes.length - 1; p >= 0; p--) {
      const probe = probes[p];
      probe.t += dt * probe.speed;
      const legs = probe.path.length - 1;
      if (probe.t >= legs) {
        nodeHeat[probe.path[legs]] = 1;
        probes.splice(p, 1);
        continue;
      }
      const leg = Math.max(0, Math.floor(probe.t));
      const from = probe.path[leg];
      const to = probe.path[leg + 1];
      const key = edgeIndex.get(from + ':' + to);
      if (key !== undefined) edgeHeat[key] = 1;
      nodeHeat[from] = Math.max(nodeHeat[from], 1);
    }

    draw();
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const pts = NODES.map((_, i) => pos(i));

    // edges
    EDGES.forEach(([a, b], i) => {
      const heat = edgeHeat[i];
      const interior = !NODES[a].leaf && !NODES[b].leaf;

      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);

      if (interior) {
        // unobserved structure — dashed, quiet
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba(COLOR.signalDim, 0.55);
      } else {
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexToRgba(COLOR.signalDim, 0.38);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // active measurement burns amber over the top
      if (heat > 0.01) {
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = hexToRgba(COLOR.trace, heat * 0.85);
        ctx.shadowColor = hexToRgba(COLOR.trace, heat * 0.5);
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });

    // probe dots
    probes.forEach(probe => {
      const leg = Math.floor(probe.t);
      if (!(leg >= 0) || leg >= probe.path.length - 1) return;
      const f = probe.t - leg;
      const a = pts[probe.path[leg]];
      const b = pts[probe.path[leg + 1]];
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.trace;
      ctx.shadowColor = hexToRgba(COLOR.trace, 0.8);
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // nodes
    NODES.forEach((node, i) => {
      const { x, y } = pts[i];
      const heat = nodeHeat[i];

      if (node.leaf) {
        // observed: filled, always visible
        const r = 4 + heat * 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = heat > 0.05
          ? hexToRgba(COLOR.trace, 0.55 + heat * 0.45)
          : hexToRgba(COLOR.signal, 0.9);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, r + 4 + heat * 5, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(heat > 0.05 ? COLOR.trace : COLOR.signal, 0.16 + heat * 0.3);
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // unobserved: hollow, faint
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = COLOR.ink;
        ctx.fill();
        ctx.strokeStyle = hexToRgba(heat > 0.05 ? COLOR.trace : COLOR.signalDim, 0.5 + heat * 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  /* --- Wire up --- */
  resize();
  window.addEventListener('resize', resize);

  if (reduceMotion) {
    draw();
  } else {
    window.addEventListener('pointermove', e => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    // seed a couple so the figure is alive on arrival
    spawnProbe();
    requestAnimationFrame(frame);
  }
})();
