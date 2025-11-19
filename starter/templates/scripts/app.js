const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const initNavToggle = () => {
  const header = qs('.site-header');
  const toggle = qs('[data-nav-toggle]');
  if (!header || !toggle) return;

  toggle.addEventListener('click', () => {
    const isOpen = header.getAttribute('data-nav-open') === 'true';
    header.setAttribute('data-nav-open', String(!isOpen));
  });
};

const initIntersectAnimations = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
        }
      });
    },
    { threshold: 0.2 },
  );

  qsa('.section').forEach((section) => observer.observe(section));
};

window.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initIntersectAnimations();
});

