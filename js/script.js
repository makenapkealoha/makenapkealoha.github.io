// Optional: Add simple fade-in effect on scroll
window.addEventListener('scroll', () => {
  document.querySelectorAll('.fade-in').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      el.style.animationPlayState = 'running';
    }
  });
});
