/* Shared behaviour for every page. */

(function () {
  /* --- Mark the current page in the nav --- */
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const target = link.getAttribute('href');
    if (target === here) link.setAttribute('aria-current', 'page');
  });

  /* --- Reveal sections as they enter the viewport --- */
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  items.forEach((el, i) => {
    el.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
    observer.observe(el);
  });
})();
