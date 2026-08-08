/* =========================================================
   Supplementary material — your personal statistics index.

   ADDING MATERIAL: edit the LIBRARY array below. Nothing else
   needs to change; the page rebuilds itself from this data.

   Each entry:
     title  — what it is
     note   — one line of context (optional)
     kind   — badge text: "Notes", "PDF", "Code", "Book", "Course", "Paper"
     url    — where it lives (optional; omit and it renders as a
              greyed placeholder you can fill in later)

   For files, drop them in the notes/ folder and point url at
   e.g. "notes/mle-derivations.pdf".
   ========================================================= */

const LIBRARY = [
  {
    topic: 'Probability',
    entries: [
      { title: 'Measure-theoretic foundations', note: 'Sigma-algebras, measurable functions, Lebesgue integration', kind: 'Notes' },
      { title: 'Distribution families and their relationships', note: 'Exponential family, conjugacy, limiting cases', kind: 'Notes' },
      { title: 'Modes of convergence', note: 'Almost sure, in probability, in distribution, in Lp', kind: 'Notes' },
      { title: 'Limit theorems', note: 'LLN, CLT, delta method, Slutsky', kind: 'Notes' },
      { title: 'Martingales and stopping times', kind: 'Notes' }
    ]
  },
  {
    topic: 'Statistical inference',
    entries: [
      { title: 'Point estimation', note: 'MLE, method of moments, sufficiency, Rao–Blackwell', kind: 'Notes' },
      { title: 'Hypothesis testing', note: 'Neyman–Pearson, likelihood ratio, Wald, score', kind: 'Notes' },
      { title: 'Confidence sets and duality with testing', kind: 'Notes' },
      { title: 'Asymptotic theory', note: 'Consistency, asymptotic normality, efficiency bounds', kind: 'Notes' },
      { title: 'Bayesian inference', note: 'Priors, posteriors, credible intervals, model comparison', kind: 'Notes' }
    ]
  },
  {
    topic: 'Linear and generalized models',
    entries: [
      { title: 'Linear regression', note: 'Geometry of least squares, Gauss–Markov, diagnostics', kind: 'Notes' },
      { title: 'Generalized linear models', note: 'Link functions, IRLS, deviance', kind: 'Notes' },
      { title: 'Mixed and hierarchical models', kind: 'Notes' },
      { title: 'Regularization', note: 'Ridge, lasso, elastic net, and what each shrinks', kind: 'Notes' },
      { title: 'Model selection', note: 'AIC, BIC, cross-validation, and when they disagree', kind: 'Notes' }
    ]
  },
  {
    topic: 'Computational statistics',
    entries: [
      { title: 'Monte Carlo fundamentals', note: 'Inverse transform, rejection, importance sampling', kind: 'Notes' },
      { title: 'MCMC', note: 'Metropolis–Hastings, Gibbs, Hamiltonian Monte Carlo', kind: 'Notes' },
      { title: 'Diagnostics for MCMC', note: 'Trace plots, R-hat, effective sample size', kind: 'Notes' },
      { title: 'The EM algorithm', note: 'Derivation, convergence, common applications', kind: 'Notes' },
      { title: 'Bootstrap and resampling', kind: 'Notes' }
    ]
  },
  {
    topic: 'Optimization',
    entries: [
      { title: 'Convexity', note: 'Convex sets and functions, recognizing convex problems', kind: 'Notes' },
      { title: 'Duality and KKT conditions', kind: 'Notes' },
      { title: 'First-order methods', note: 'Gradient descent, momentum, proximal methods', kind: 'Notes' },
      { title: 'Second-order methods', note: 'Newton, quasi-Newton, BFGS', kind: 'Notes' },
      { title: 'Constrained and large-scale optimization', note: 'ADMM, interior point, stochastic methods', kind: 'Notes' }
    ]
  },
  {
    topic: 'Networks',
    entries: [
      { title: 'Network tomography — problem setup', note: 'Observable end-to-end paths vs. unobservable interior links', kind: 'Notes' },
      { title: 'Identifiability conditions', note: 'When interior parameters can be recovered at all', kind: 'Notes' },
      { title: 'Estimation approaches', note: 'Likelihood-based, moment-based, regularized inversion', kind: 'Notes' },
      { title: 'Graph and matrix background', note: 'Routing matrices, incidence structure, spectral properties', kind: 'Notes' },
      { title: 'Key papers to revisit', kind: 'Paper' }
    ]
  },
  {
    topic: 'Machine learning',
    entries: [
      { title: 'Bias–variance decomposition', kind: 'Notes' },
      { title: 'Classification methods', note: 'Logistic regression, LDA/QDA, SVM, trees', kind: 'Notes' },
      { title: 'Ensembles', note: 'Bagging, random forests, boosting', kind: 'Notes' },
      { title: 'Unsupervised methods', note: 'PCA, clustering, mixture models', kind: 'Notes' },
      { title: 'Neural networks', note: 'Backpropagation, architectures, optimization in practice', kind: 'Notes' }
    ]
  },
  {
    topic: 'Programming and tooling',
    entries: [
      { title: 'R idioms worth remembering', note: 'Vectorization, data.table/dplyr, S3 vs S4', kind: 'Code' },
      { title: 'Python for statistics', note: 'NumPy broadcasting, SciPy stats, pandas gotchas', kind: 'Code' },
      { title: 'Reproducibility setup', note: 'renv, virtualenv, seeds, project structure', kind: 'Code' },
      { title: 'LaTeX reference', note: 'Templates, math macros, bibliography workflow', kind: 'Notes' },
      { title: 'Cluster and HPC notes', note: 'Job submission, parallel patterns', kind: 'Notes' }
    ]
  },
  {
    topic: 'Teaching material',
    entries: [
      { title: 'Explanations that actually land', note: 'Framings collected from six courses of TA work', kind: 'Notes' },
      { title: 'Common student misconceptions', note: 'p-values, independence, conditioning', kind: 'Notes' },
      { title: 'Worked examples and problem sets', kind: 'PDF' }
    ]
  }
];

/* ---------- Rendering ---------- */
(function () {
  const root = document.getElementById('library');
  const search = document.getElementById('library-search');
  const filterRow = document.getElementById('library-filters');
  const empty = document.getElementById('library-empty');
  if (!root) return;

  let activeTopic = 'All';
  let query = '';

  /* Filter chips, built from the data itself */
  const topics = ['All', ...LIBRARY.map(group => group.topic)];
  topics.forEach(topic => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.textContent = topic;
    chip.setAttribute('aria-pressed', String(topic === 'All'));
    chip.addEventListener('click', () => {
      activeTopic = topic;
      filterRow.querySelectorAll('.filter-chip').forEach(other => {
        other.setAttribute('aria-pressed', String(other.textContent === topic));
      });
      render();
    });
    filterRow.appendChild(chip);
  });

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });

  function matches(entry) {
    if (!query) return true;
    return (entry.title + ' ' + (entry.note || '')).toLowerCase().includes(query);
  }

  function buildEntry(entry) {
    const li = document.createElement('li');
    li.className = 'entry' + (entry.url ? '' : ' is-stub');

    const inner = document.createElement(entry.url ? 'a' : 'div');
    if (entry.url) {
      inner.href = entry.url;
    } else {
      inner.className = 'entry-inner';
    }

    const left = document.createElement('div');
    const title = document.createElement('span');
    title.className = 'entry-title';
    title.textContent = entry.title;
    left.appendChild(title);

    if (entry.note) {
      const note = document.createElement('span');
      note.className = 'entry-note';
      note.textContent = entry.note;
      left.appendChild(note);
    }

    const kind = document.createElement('span');
    kind.className = 'entry-kind';
    kind.textContent = entry.url ? (entry.kind || 'Link') : 'To write';

    inner.append(left, kind);
    li.appendChild(inner);
    return li;
  }

  function render() {
    root.innerHTML = '';
    let shown = 0;

    LIBRARY.forEach(group => {
      if (activeTopic !== 'All' && group.topic !== activeTopic) return;

      const found = group.entries.filter(matches);
      if (!found.length) return;
      shown += found.length;

      const section = document.createElement('section');
      section.className = 'topic';

      const head = document.createElement('div');
      head.className = 'topic-head';

      const h2 = document.createElement('h2');
      h2.textContent = group.topic;

      const count = document.createElement('span');
      count.className = 'topic-count';
      const written = found.filter(e => e.url).length;
      count.textContent = `${written} of ${found.length} written`;

      head.append(h2, count);

      const list = document.createElement('ul');
      list.className = 'entry-list';
      found.forEach(entry => list.appendChild(buildEntry(entry)));

      section.append(head, list);
      root.appendChild(section);
    });

    empty.hidden = shown > 0;
  }

  render();
})();
