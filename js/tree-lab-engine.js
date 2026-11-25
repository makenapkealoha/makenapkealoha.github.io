/* =========================================================
   Forking-tree lab — estimation engine (no DOM).
   Vanilla OLS (minimum-norm least squares) and vanilla NNLS
   (Lawson–Hanson) on the route-mean design of a forking tree.
   ========================================================= */
(function (root) {
  "use strict";

  /* ---------- seeded random numbers ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------- small dense linear algebra ---------- */
  // Solve S z = r for symmetric positive (semi)definite S by Cholesky,
  // adding a tiny ridge if S is numerically singular.
  function spdSolve(S, r) {
    const n = r.length;
    let ridge = 0;
    const scale = Math.max(1e-300, ...S.map((row, i) => Math.abs(row[i])));
    for (let attempt = 0; attempt < 6; attempt++) {
      const L = S.map(row => row.slice());
      let ok = true;
      for (let j = 0; j < n && ok; j++) {
        let d = L[j][j] + ridge;
        for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
        if (!(d > 1e-14 * scale)) { ok = false; break; }
        d = Math.sqrt(d);
        L[j][j] = d;
        for (let i = j + 1; i < n; i++) {
          let s = L[i][j];
          for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
          L[i][j] = s / d;
        }
      }
      if (ok) {
        const y = new Array(n);
        for (let i = 0; i < n; i++) {
          let s = r[i];
          for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
          y[i] = s / L[i][i];
        }
        const z = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
          let s = y[i];
          for (let k = i + 1; k < n; k++) s -= L[k][i] * z[k];
          z[i] = s / L[i][i];
        }
        return z;
      }
      ridge = ridge === 0 ? 1e-12 * scale : ridge * 100;
    }
    throw new Error("linear system could not be solved");
  }

  function matVec(A, x) { return A.map(row => row.reduce((s, a, j) => s + a * x[j], 0)); }
  function matTVec(A, y) {
    const p = A[0].length, out = new Array(p).fill(0);
    for (let i = 0; i < A.length; i++) for (let j = 0; j < p; j++) out[j] += A[i][j] * y[i];
    return out;
  }

  // Least squares on the columns `cols` of A by Householder QR (more accurate than
  // the normal equations when route weights make the columns badly scaled).
  function lsqCols(A, b, cols) {
    const n = A.length, k = cols.length;
    const R = A.map(row => cols.map(j => row[j]));
    const y = b.slice();
    const steps = Math.min(n, k);
    for (let c = 0; c < steps; c++) {
      let nrm = 0;
      for (let i = c; i < n; i++) nrm += R[i][c] * R[i][c];
      nrm = Math.sqrt(nrm);
      if (nrm === 0) continue;
      const alpha = R[c][c] > 0 ? -nrm : nrm;
      const v = new Array(n).fill(0);
      v[c] = R[c][c] - alpha;
      for (let i = c + 1; i < n; i++) v[i] = R[i][c];
      let vv = 0;
      for (let i = c; i < n; i++) vv += v[i] * v[i];
      if (vv === 0) continue;
      for (let j = c; j < k; j++) {
        let d = 0;
        for (let i = c; i < n; i++) d += v[i] * R[i][j];
        d = 2 * d / vv;
        for (let i = c; i < n; i++) R[i][j] -= d * v[i];
      }
      let d = 0;
      for (let i = c; i < n; i++) d += v[i] * y[i];
      d = 2 * d / vv;
      for (let i = c; i < n; i++) y[i] -= d * v[i];
    }
    const scale = Math.max(1e-300, ...Array.from({ length: steps }, (_, i) => Math.abs(R[i][i])));
    const z = new Array(k).fill(0);
    for (let i = steps - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < k; j++) s -= R[i][j] * z[j];
      z[i] = Math.abs(R[i][i]) > 1e-13 * scale ? s / R[i][i] : 0;
    }
    return z;
  }

  /* ---------- estimators ---------- */
  // Minimum-norm least squares. For a forking tree every route has its own
  // leaf link, so X has full row rank and beta = X' (X X')^{-1} y.
  function olsMinNorm(X, y) {
    const XXt = X.map(ri => X.map(rj => ri.reduce((s, a, j) => s + a * rj[j], 0)));
    return matTVec(X, spdSolve(XXt, y));
  }

  // Lawson–Hanson NNLS: min ||X b - y|| subject to b >= 0.
  function nnls(A, b, maxIter) {
    const p = A[0].length;
    let colMax = 0;
    for (let j = 0; j < p; j++) {
      let c = 0;
      for (let i = 0; i < A.length; i++) c += A[i][j] * A[i][j];
      colMax = Math.max(colMax, Math.sqrt(c));
    }
    const tol = 1e-12 * Math.max(1e-300, colMax) * Math.max(1e-300, norm(b));
    maxIter = maxIter || 30 * p;
    let x = new Array(p).fill(0);
    const passive = new Array(p).fill(false);
    let w = matTVec(A, b);
    let iter = 0;
    while (iter < maxIter) {
      let jmax = -1, wmax = tol;
      for (let j = 0; j < p; j++) if (!passive[j] && w[j] > wmax) { wmax = w[j]; jmax = j; }
      if (jmax < 0) break;
      passive[jmax] = true;
      while (true) {
        iter++;
        const P = [];
        for (let j = 0; j < p; j++) if (passive[j]) P.push(j);
        const zP = lsqCols(A, b, P);
        const z = new Array(p).fill(0);
        P.forEach((j, k) => { z[j] = zP[k]; });
        if (P.every(j => z[j] > 0)) { x = z; break; }
        let alpha = Infinity;
        for (const j of P) if (z[j] <= 0) alpha = Math.min(alpha, x[j] / (x[j] - z[j]));
        for (let j = 0; j < p; j++) x[j] += alpha * (z[j] - x[j]);
        for (const j of P) if (x[j] <= 1e-15 * Math.max(1, Math.abs(z[j]))) { passive[j] = false; x[j] = 0; }
        if (iter >= maxIter) break;
      }
      const resid = b.map((bi, i) => bi - A[i].reduce((s, a, j) => s + a * x[j], 0));
      w = matTVec(A, resid);
    }
    return x.map(v => (v < 0 ? 0 : v));
  }

  // NNLS from the Gram form (Bro & de Jong's fast NNLS): G = A'A, h = A'b.
  // `start` is an optional starting passive set (e.g. the support of a nearby fit);
  // the result is the same minimiser, it is only reached in fewer steps.
  function nnlsGram(G, h, bNorm, start) {
    const p = h.length;
    let diagMax = 0;
    for (let j = 0; j < p; j++) diagMax = Math.max(diagMax, G[j][j]);
    const tol = 1e-12 * Math.sqrt(Math.max(1e-300, diagMax)) * Math.max(1e-300, bNorm);
    const passive = new Array(p).fill(false), blocked = new Array(p).fill(false);
    let x = new Array(p).fill(0);
    // Cholesky factor of G[P,P], grown one column at a time.
    let P = [], L = [];
    const addCol = j => {
      const k = P.length, l = new Array(k);
      for (let i = 0; i < k; i++) {
        let s2 = G[P[i]][j];
        for (let t = 0; t < i; t++) s2 -= L[i][t] * l[t];
        l[i] = s2 / L[i][i];
      }
      let d = G[j][j];
      for (let t = 0; t < k; t++) d -= l[t] * l[t];
      if (!(d > 1e-12 * Math.max(G[j][j], 1e-300))) return false;   // dependent column
      l.push(Math.sqrt(d));
      L.push(l); P.push(j);
      return true;
    };
    const rebuild = () => {
      const keep = P.filter(j => passive[j]);
      P = []; L = [];
      for (const j of keep) if (!addCol(j)) { passive[j] = false; blocked[j] = true; }
    };
    const solveP = () => {
      const k = P.length, y = new Array(k), zP = new Array(k);
      for (let i = 0; i < k; i++) {
        let s2 = h[P[i]];
        for (let t = 0; t < i; t++) s2 -= L[i][t] * y[t];
        y[i] = s2 / L[i][i];
      }
      for (let i = k - 1; i >= 0; i--) {
        let s2 = y[i];
        for (let t = i + 1; t < k; t++) s2 -= L[t][i] * zP[t];
        zP[i] = s2 / L[i][i];
      }
      const z = new Array(p).fill(0);
      P.forEach((j, i) => { z[j] = zP[i]; });
      return z;
    };
    const inner = () => {
      for (let guard = 0; guard < 4 * p + 10; guard++) {
        const z = solveP();
        if (P.every(j => z[j] > 0)) { x = z; return; }
        let alpha = Infinity;
        for (const j of P) if (z[j] <= 0) alpha = Math.min(alpha, x[j] / (x[j] - z[j]));
        if (!Number.isFinite(alpha)) alpha = 0;
        for (let j = 0; j < p; j++) x[j] += alpha * (z[j] - x[j]);
        let removed = false;
        for (const j of P) if (x[j] <= 1e-15 * Math.max(1, Math.abs(z[j])) || (alpha === 0 && z[j] <= 0)) {
          passive[j] = false; x[j] = 0; removed = true;
        }
        if (!removed) return;
        rebuild();
      }
    };
    if (start && start.length) {
      for (const j of start) if (addCol(j)) passive[j] = true;
      inner();
    }
    for (let iter = 0; iter < 30 * p + 10; iter++) {
      let jmax = -1, wmax = tol;
      for (let j = 0; j < p; j++) {
        if (passive[j] || blocked[j]) continue;
        let w = h[j];
        for (const c of P) w -= G[j][c] * x[c];
        if (w > wmax) { wmax = w; jmax = j; }
      }
      if (jmax < 0) break;
      if (!addCol(jmax)) { blocked[jmax] = true; continue; }
      passive[jmax] = true;
      inner();
    }
    return x.map(v => (v < 0 ? 0 : v));
  }

  // Vanilla NNLS on the unweighted route means, through the Gram solver.
  function nnlsUnit(X, ybar) {
    const gs = weightedGram(X, X.map(() => 1), ybar);
    return nnlsGram(gs.G, gs.h, gs.bNorm);
  }

  // Gram system of a weighted 0/1 route design, built from the sparse rows.
  function weightedGram(X, w, ybar) {
    const p = X[0].length;
    const G = Array.from({ length: p }, () => new Array(p).fill(0));
    const h = new Array(p).fill(0);
    let bb = 0;
    X.forEach((row, i) => {
      const on = [];
      for (let j = 0; j < p; j++) if (row[j] !== 0) on.push(j);
      const w2 = w[i] * w[i];
      for (const a of on) {
        h[a] += w2 * row[a] * ybar[i];
        for (const c of on) G[a][c] += w2 * row[a] * row[c];
      }
      bb += w2 * ybar[i] * ybar[i];
    });
    return { G, h, bNorm: Math.sqrt(bb) };
  }

  /* ---------- tree -> design ---------- */
  // nodes: [{id, parent, delay}] with the root monitor having parent === null.
  // A link is the edge into a non-root node; its delay lives on that node.
  function buildDesign(nodes) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const kids = new Map(nodes.map(n => [n.id, []]));
    let rootId = null;
    nodes.forEach(n => { if (n.parent === null) rootId = n.id; else kids.get(n.parent).push(n.id); });

    // BFS order gives stable display names L1, L2, ...
    const order = [], depth = new Map([[rootId, 0]]);
    const queue = [rootId];
    while (queue.length) {
      const u = queue.shift();
      for (const v of kids.get(u)) { order.push(v); depth.set(v, depth.get(u) + 1); queue.push(v); }
    }
    const linkName = new Map(order.map((id, i) => [id, "L" + (i + 1)]));
    const linkIndex = new Map(order.map((id, i) => [id, i]));

    const leaves = order.filter(id => kids.get(id).length === 0);
    const routes = leaves.map(leaf => {
      const path = [];
      for (let u = leaf; byId.get(u).parent !== null; u = byId.get(u).parent) path.push(u);
      return path.reverse();
    });
    const p = order.length;
    const X = routes.map(path => {
      const row = new Array(p).fill(0);
      path.forEach(id => { row[linkIndex.get(id)] = 1; });
      return row;
    });

    // Exact-duplicate columns (links on every route together) form one super-link.
    const groups = new Map();
    order.forEach((id, j) => {
      const key = X.map(r => r[j]).join("");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(id);
    });
    const superLinks = [...groups.values()].map(ids => ({
      ids, names: ids.map(id => linkName.get(id)),
      label: ids.length === 1 ? linkName.get(ids[0]) : ids.map(id => linkName.get(id)).join("+"),
      truth: ids.reduce((s, id) => s + (Number(byId.get(id).delay) || 0), 0),
    }));
    const Xs = routes.map(path => {
      const on = new Set(path);
      return superLinks.map(sl => (sl.ids.some(id => on.has(id)) ? 1 : 0));
    });
    return { order, linkName, depth, leaves, routes, X, Xs, superLinks, rootId };
  }

  /* ---------- one simulated experiment ---------- */
  function simulate(design, opts) {
    const m = Math.max(1, Math.round(opts.probes)), sigma = Math.max(0, opts.sigma);
    const rng = mulberry32(opts.seed);
    const beta = design.superLinks.map(s => s.truth);
    const clean = matVec(design.Xs, beta);
    const probes = clean.map(mu => {
      const v = new Array(m);
      for (let k = 0; k < m; k++) v[k] = mu + sigma * gaussian(rng);
      return v;
    });
    const ybar = probes.map(v => v.reduce((s, a) => s + a, 0) / m);
    const alpha = lassoAlpha(opts, design.Xs);
    return { beta, probes, ybar, alpha,
             ols: olsMinNorm(design.Xs, ybar),
             lasso: lasso(design.Xs, ybar, alpha),
             nnls: nnlsUnit(design.Xs, ybar) };
  }

  /* ---------- vanilla LASSO (no intercept, no sign constraint) ---------- */
  // Minimises (1/(2n)) ||y - X b||^2 + alpha ||b||_1, the scikit-learn objective,
  // by cyclic coordinate descent on the sparse 0/1 columns.
  function lassoAlpha(opts, X) {
    if (opts.lassoAlpha !== null && opts.lassoAlpha !== undefined && opts.lassoAlpha !== "" &&
        Number.isFinite(Number(opts.lassoAlpha)))
      return Math.max(0, Number(opts.lassoAlpha));
    const n = X.length, p = X[0].length;
    const sdMean = Math.max(0, opts.sigma) / Math.sqrt(Math.max(1, Math.round(opts.probes)));
    // universal level sigma_ybar * sqrt(2 log p / n), floored so alpha > 0
    return Math.max(1e-4, sdMean * Math.sqrt(2 * Math.log(Math.max(2, p)) / n));
  }

  function lasso(X, y, alpha, maxSweeps, tol) {
    const n = X.length, p = X[0].length;
    maxSweeps = maxSweeps || 20000; tol = tol || 1e-11;
    const rowsOf = Array.from({ length: p }, (_, j) => {
      const idx = [];
      for (let i = 0; i < n; i++) if (X[i][j] !== 0) idx.push(i);
      return idx;
    });
    const colsq = rowsOf.map((idx, j) => idx.reduce((s, i) => s + X[i][j] * X[i][j], 0));
    const b = new Array(p).fill(0), r = y.slice();
    const thr = n * alpha;
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let maxDelta = 0, maxB = 0;
      for (let j = 0; j < p; j++) {
        if (colsq[j] === 0) continue;
        let rho = colsq[j] * b[j];
        for (const i of rowsOf[j]) rho += X[i][j] * r[i];
        const nb = rho > thr ? (rho - thr) / colsq[j] : rho < -thr ? (rho + thr) / colsq[j] : 0;
        const d = nb - b[j];
        if (d !== 0) {
          for (const i of rowsOf[j]) r[i] -= X[i][j] * d;
          b[j] = nb;
          maxDelta = Math.max(maxDelta, Math.abs(d));
        }
        maxB = Math.max(maxB, Math.abs(b[j]));
      }
      if (maxDelta <= tol * Math.max(1, maxB)) break;
    }
    return b;
  }

  /* ---------- stability-selected NNLS (the paper's Algorithm 1 + refit) ---------- */
  // Heteroskedastic route weights w_i = m_i / v_i on the route means; B subsamples of
  // max(2, floor(m_i/2)) probes drawn within each route (with replacement, as in the
  // simulation code); NNLS on each subsample; selection frequency pi_j(c) of
  // {beta_j > c sqrt(2 log p / N_eff_j)} over the c-grid; stable set
  // S = {j : pi_j(c*) >= pi0}; non-negative refit on S with the full-data weights.
  const C_GRID = Array.from({ length: 100 }, (_, i) => Math.pow(10, -7 + 12 * i / 99));

  function routeWeights(probesByRoute) {
    const w = [], ybar = [];
    probesByRoute.forEach(v => {
      const m = v.length, mean = v.reduce((t, a) => t + a, 0) / m;
      const varr = m > 1 ? v.reduce((t, a) => t + (a - mean) * (a - mean), 0) / (m - 1) : 0;
      w.push(Math.sqrt(m / Math.max(varr, 1e-8))); ybar.push(mean);
    });
    return { w, ybar };
  }

  // Weighted design and response W^{1/2} X, W^{1/2} ybar (kept for checking).
  function weightedSystem(X, probesByRoute) {
    const { w, ybar } = routeWeights(probesByRoute);
    return { Xw: X.map((r, i) => r.map(a => a * w[i])), yw: ybar.map((v, i) => v * w[i]) };
  }

  function ssStart(design, sim, opts) {
    const B = Math.max(1, Math.round(opts.B || 100));
    const X = design.Xs;
    const full = routeWeights(sim.probes);
    const gs = weightedGram(X, full.w, full.ybar);
    const xFull = nnlsGram(gs.G, gs.h, gs.bNorm);
    const start = [];
    xFull.forEach((v, j) => { if (v > 0) start.push(j); });
    return { design, probes: sim.probes, B, pi0: opts.pi0, done: 0, start, fullGram: gs,
             rng: mulberry32((opts.seed >>> 0) * 2654435761 + 97),
             coef: [], thr: [] };
  }

  // Run subsamples until `budgetMs` has passed (or all B are done). Returns true when finished.
  function ssStep(state, budgetMs) {
    const t0 = Date.now(), X = state.design.Xs, p = X[0].length;
    const logTerm = 2 * Math.log(Math.max(p, 1));
    while (state.done < state.B && Date.now() - t0 < budgetMs) {
      const sub = state.probes.map(v => {
        const ns = Math.max(2, Math.floor(v.length / 2));
        const s = new Array(ns);
        for (let k = 0; k < ns; k++) s[k] = v[Math.floor(state.rng() * v.length)];
        return s;
      });
      const { w, ybar } = routeWeights(sub);
      const gs = weightedGram(X, w, ybar);
      state.coef.push(nnlsGram(gs.G, gs.h, gs.bNorm, state.start));
      state.thr.push(gs.G.map((row, j) => (row[j] > 0 ? Math.sqrt(logTerm / row[j]) : Infinity)));
      state.done++;
    }
    return state.done >= state.B;
  }

  function ssFinish(state) {
    const X = state.design.Xs, p = X[0].length, B = state.coef.length;
    const freqAt = c => {
      const f = new Array(p).fill(0);
      for (let b = 0; b < B; b++) for (let j = 0; j < p; j++)
        if (state.coef[b][j] > c * state.thr[b][j]) f[j] += 1 / B;
      return f;
    };
    const freqs = C_GRID.map(freqAt);
    const fmax = new Array(p).fill(0);
    freqs.forEach(f => f.forEach((v, j) => { if (v > fmax[j]) fmax[j] = v; }));
    let cStar = C_GRID[0], fStar = freqs[0];
    C_GRID.forEach((c, i) => {
      if (freqs[i].every((v, j) => Math.abs(v - fmax[j]) < 1e-12)) { cStar = c; fStar = freqs[i]; }
    });
    const stable = [];
    fStar.forEach((v, j) => { if (v >= state.pi0 - 1e-12) stable.push(j); });
    const est = new Array(p).fill(0);
    if (stable.length) {
      const { G, h, bNorm } = state.fullGram;
      const sub = nnlsGram(stable.map(a => stable.map(c => G[a][c])), stable.map(a => h[a]), bNorm);
      stable.forEach((j, k) => { est[j] = sub[k]; });
    }
    return { est, freq: fStar, cStar, stable, B };
  }

  /* ---------- NDCG@K with ties ---------- */
  // Gains are max(true delay, 0). Links are ranked by estimate; links whose estimates
  // tie share a rank (e.g. 3rd). If a tied group reaches past K, the whole group is
  // counted and no later group is. A tied group's credit is its average gain times the
  // average discount 1/log2(position + 1) over the positions it takes up, so a tie can
  // never score better than a correct order (this is scikit-learn's tie rule apart from
  // keeping the whole boundary group). The ideal DCG uses the same number of links.
  function ndcgAtK(truth, est, K, tieTol) {
    tieTol = tieTol === undefined ? 1e-9 : tieTol;
    const p = truth.length;
    K = Math.max(1, Math.min(Math.round(K), p));
    const gains = truth.map(t => Math.max(t, 0));
    const order = est.map((e, i) => i).sort((a, b) => est[b] - est[a]);
    const disc = q => 1 / Math.log2(q + 1);
    let pos = 0, dcg = 0;
    const ranks = new Array(p).fill(null);
    for (let s = 0; s < p && pos < K;) {
      let e = s;
      while (e + 1 < p && Math.abs(est[order[e + 1]] - est[order[s]]) <= tieTol) e++;
      const size = e - s + 1;
      let dsum = 0, gsum = 0;
      for (let q = pos + 1; q <= pos + size; q++) dsum += disc(q);
      for (let t = s; t <= e; t++) { gsum += gains[order[t]]; ranks[order[t]] = pos + 1; }
      dcg += (gsum / size) * dsum;
      pos += size; s = e + 1;
    }
    const sorted = gains.slice().sort((a, b) => b - a);
    let idcg = 0;
    for (let q = 1; q <= pos; q++) idcg += sorted[q - 1] * disc(q);
    return { ndcg: idcg > 0 ? dcg / idcg : null, counted: pos, K, ranks };
  }

  /* ---------- metrics ---------- */
  function norm(v) { return Math.sqrt(v.reduce((s, a) => s + a * a, 0)); }
  function key(v) { return Math.round(v * 1e9) / 1e9; }

  // bins = distinct true values (including 0 when present), largest first.
  function metrics(beta, est, zeroTol) {
    const denom = norm(beta) || 1;
    const values = [...new Set(beta.map(key))].sort((a, b) => b - a);
    const tiers = [...new Set([...values, 0])].sort((a, b) => a - b);
    const band = e => {          // nearest tier value
      let best = tiers[0];
      for (const t of tiers) if (Math.abs(e - t) < Math.abs(e - best)) best = t;
      return best;
    };
    const assigned = est.map(band);
    const bins = values.map(v => {
      const idx = beta.map((b, i) => (key(b) === v ? i : -1)).filter(i => i >= 0);
      const signOk = idx.filter(i => (v === 0 ? Math.abs(est[i]) <= zeroTol : est[i] > zeroTol)).length;
      const hits = idx.filter(i => assigned[i] === v).length;
      const nAssigned = assigned.filter(a => a === v).length;
      return {
        value: v, n: idx.length,
        ssr: signOk / idx.length,
        rl2: norm(idx.map(i => est[i] - beta[i])) / denom,
        recall: hits / idx.length,
        precision: nAssigned ? hits / nAssigned : null,
      };
    });
    const nz = beta.map(b => b !== 0), sel = est.map(e => e > zeroTol);
    const tp = sel.filter((s, i) => s && nz[i]).length;
    const nSel = sel.filter(Boolean).length, nNz = nz.filter(Boolean).length;
    const signOkAll = est.filter((e, i) => (beta[i] === 0 ? Math.abs(e) <= zeroTol : e > zeroTol)).length;
    return {
      bins,
      overall: {
        ssr: signOkAll / beta.length,
        rl2: norm(est.map((e, i) => e - beta[i])) / denom,
        recall: nNz ? tp / nNz : null,
        precision: nSel ? tp / nSel : null,
        negatives: est.filter(e => e < -zeroTol).length,
        mostNegative: Math.min(0, ...est),
      },
    };
  }

  function rank(A) {        // numerical rank by Gaussian elimination
    const M = A.map(r => r.slice());
    const n = M.length, p = n ? M[0].length : 0;
    let r = 0;
    for (let c = 0; c < p && r < n; c++) {
      let piv = r;
      for (let i = r + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
      if (Math.abs(M[piv][c]) < 1e-9) continue;
      [M[r], M[piv]] = [M[piv], M[r]];
      for (let i = r + 1; i < n; i++) {
        const f = M[i][c] / M[r][c];
        if (f) for (let k = c; k < p; k++) M[i][k] -= f * M[r][k];
      }
      r++;
    }
    return r;
  }

  // Basis of the null space of A (columns of the returned p x k matrix), via RREF.
  function nullSpace(A) {
    const n = A.length, p = n ? A[0].length : 0;
    const M = A.map(r => r.slice());
    const pivCols = [];
    let r = 0;
    for (let c = 0; c < p && r < n; c++) {
      let piv = r;
      for (let i = r + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
      if (Math.abs(M[piv][c]) < 1e-9) continue;
      [M[r], M[piv]] = [M[piv], M[r]];
      const d = M[r][c];
      for (let k = 0; k < p; k++) M[r][k] /= d;
      for (let i = 0; i < n; i++) if (i !== r && M[i][c] !== 0) {
        const f = M[i][c];
        for (let k = 0; k < p; k++) M[i][k] -= f * M[r][k];
      }
      pivCols.push(c); r++;
    }
    const pivSet = new Set(pivCols);
    const basis = [];
    for (let f = 0; f < p; f++) {
      if (pivSet.has(f)) continue;
      const v = new Array(p).fill(0);
      v[f] = 1;
      pivCols.forEach((c, i) => { v[c] = -M[i][f]; });
      basis.push(v);
    }
    return basis;              // array of k vectors of length p
  }

  // Is x the ONLY non-negative minimiser? All minimisers share the fitted values,
  // so another one exists iff some d != 0 has X d = 0 and d_j >= 0 wherever x_j = 0.
  function nnlsIsUnique(X, x, tol) {
    tol = tol || 1e-9;
    const p = x.length;
    const Z = [], P = [];
    x.forEach((v, j) => (v > tol ? P : Z).push(j));
    const basis = nullSpace(X);                       // k vectors
    if (basis.length === 0) return true;
    if (P.length && rank(X.map(r => P.map(j => r[j]))) < P.length) return false;
    if (Z.length === 0) return true;
    // M = rows Z of the null basis (|Z| x k), full column rank here.
    const k = basis.length;
    const M = Z.map(j => basis.map(v => v[j]));
    const MtM = Array.from({ length: k }, (_, a) =>
      Array.from({ length: k }, (_, b) => M.reduce((s, row) => s + row[a] * row[b], 0)));
    // Projector onto range(M): Pi = M (M'M)^{-1} M'
    const cols = Z.map((_, i) => spdSolve(MtM, M[i]));          // (M'M)^{-1} m_i
    const Pi = Z.map((_, i) => Z.map((_, l) => M[i].reduce((s, a, t) => s + a * cols[l][t], 0)));
    // Feasibility of u >= 0, sum(u) = 1, u in range(M)  <=>  another solution exists.
    const A = Z.map((_, i) => Z.map((_, l) => (i === l ? 1 : 0) - Pi[i][l]));
    A.push(new Array(Z.length).fill(1));
    const b = new Array(Z.length).fill(0); b.push(1);
    const u = nnls(A, b);
    const res = norm(matVec(A, u).map((v, i) => v - b[i]));
    return res > 1e-6;
  }

  const api = { mulberry32, gaussian, olsMinNorm, nnls, nnlsIsUnique, nullSpace,
                buildDesign, simulate, metrics, rank, lasso, lassoAlpha,
                ssStart, ssStep, ssFinish, weightedSystem, nnlsGram, nnlsUnit, weightedGram, ndcgAtK, C_GRID };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TreeLabEngine = api;
})(typeof window !== "undefined" ? window : this);
