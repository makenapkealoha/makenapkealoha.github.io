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

  // Least squares on the columns `cols` of A (via normal equations).
  function lsqCols(A, b, cols) {
    const k = cols.length;
    const G = Array.from({ length: k }, () => new Array(k).fill(0));
    const r = new Array(k).fill(0);
    for (let i = 0; i < A.length; i++) {
      const row = A[i];
      for (let a = 0; a < k; a++) {
        const va = row[cols[a]];
        if (va === 0) continue;
        r[a] += va * b[i];
        for (let c = a; c < k; c++) G[a][c] += va * row[cols[c]];
      }
    }
    for (let a = 0; a < k; a++) for (let c = 0; c < a; c++) G[a][c] = G[c][a];
    return spdSolve(G, r);
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
    const tol = 1e-10 * Math.max(1, Math.max(...A.map(r => Math.max(...r.map(Math.abs))))) *
                Math.max(1, Math.max(...b.map(Math.abs)));
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
        if (P.every(j => z[j] > tol)) { x = z; break; }
        let alpha = Infinity;
        for (const j of P) if (z[j] <= tol) alpha = Math.min(alpha, x[j] / (x[j] - z[j]));
        for (let j = 0; j < p; j++) x[j] += alpha * (z[j] - x[j]);
        for (const j of P) if (x[j] <= tol) { passive[j] = false; x[j] = 0; }
        if (iter >= maxIter) break;
      }
      const resid = b.map((bi, i) => bi - A[i].reduce((s, a, j) => s + a * x[j], 0));
      w = matTVec(A, resid);
    }
    return x.map(v => (v < 0 ? 0 : v));
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
    const ybar = clean.map(mu => {
      let s = 0;
      for (let k = 0; k < m; k++) s += mu + sigma * gaussian(rng);
      return s / m;
    });
    return { beta, ybar, ols: olsMinNorm(design.Xs, ybar), nnls: nnls(design.Xs, ybar) };
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
                buildDesign, simulate, metrics, rank };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TreeLabEngine = api;
})(typeof window !== "undefined" ? window : this);
