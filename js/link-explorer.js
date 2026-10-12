/* Interactive link-delay explorer.
   Loads data/link_explorer.json (written by the notebook's export cell),
   draws it with plotly.js, and links each map link to its bar on hover. */

(function () {
  const el = document.getElementById('explorer');
  const status = document.getElementById('explorer-status');
  const DATA_URL = 'data/link_explorer.json';

  function fail(msg) {
    if (status) { status.textContent = msg; status.classList.add('is-error'); }
  }

  if (typeof Plotly === 'undefined') {
    fail('The plotting library could not load. Check your connection and reload the page.');
    return;
  }

  fetch(DATA_URL)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(({ figure, linkmap }) => {
      if (status) status.remove();
      return Plotly.newPlot(el, figure.data, figure.layout,
                            { displaylogo: false, responsive: true,
                              modeBarButtonsToRemove: ['lasso2d', 'select2d'] })
        .then(() => attachLinkedHover(el, linkmap));
    })
    .catch(() => {
      fail(location.protocol === 'file:'
        ? 'Open this page through a web server (for example: python -m http.server), not as a local file.'
        : 'The explorer data could not be loaded. Please reload the page.');
    });

  /* Hovering a map link makes it glow and enlarges its bar on the right;
     hovering a bar or estimate diamond highlights its link on the map. */
  function attachLinkedHover(gd, LM) {
    let cur = null;

    function on(mt) {
      if (cur === mt) return;
      off();
      const e = LM.maps[mt];
      if (!e) return;
      cur = mt;
      Plotly.restyle(gd, { x: [e.x], y: [e.y] }, [LM.halo]);
      Plotly.restyle(gd, { 'line.width': e.w * 2.2, opacity: 1 }, [mt]);
      const wd = new Array(e.nbar).fill(0.6), lw = new Array(e.nbar).fill(0);
      wd[e.pt] = 1.0; lw[e.pt] = 3;
      Plotly.restyle(gd, { width: [wd], 'marker.line.width': [lw] }, [e.bar]);
    }

    function off() {
      if (cur === null) return;
      const e = LM.maps[cur];
      Plotly.restyle(gd, { x: [[null]], y: [[null]] }, [LM.halo]);
      Plotly.restyle(gd, { 'line.width': e.w, opacity: e.op }, [cur]);
      Plotly.restyle(gd, { width: [new Array(e.nbar).fill(0.6)],
                           'marker.line.width': [new Array(e.nbar).fill(0)] }, [e.bar]);
      cur = null;
    }

    gd.on('plotly_hover', ev => {
      const p = ev.points[0], c = p.curveNumber;
      if (LM.maps[c]) { on(c); return; }
      const key = c + ':' + p.pointNumber;
      if (key in LM.bars) on(LM.bars[key]);
    });
    gd.on('plotly_unhover', off);
    /* switching monitor in the drop-down clears any highlight first */
    gd.on('plotly_buttonclicked', off);
  }
})();
