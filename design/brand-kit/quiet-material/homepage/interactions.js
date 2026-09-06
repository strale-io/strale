// Local study interaction only: no network, persistence, accounts or billing.
(() => {
  const trigger = document.querySelector('[data-disclosure]');
  if (!trigger) return;
  const panel = document.getElementById(trigger.getAttribute('aria-controls'));
  const close = (restore = false) => {
    trigger.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    if (restore) trigger.focus();
  };
  trigger.addEventListener('click', () => {
    const open = trigger.getAttribute('aria-expanded') !== 'true';
    trigger.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener('click', event => {
    if (!trigger.contains(event.target) && !panel.contains(event.target)) close();
  });
  document.addEventListener('focusin', event => {
    if (!trigger.contains(event.target) && !panel.contains(event.target)) close();
  });
  panel.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  window.addEventListener('resize', () => {
    if (getComputedStyle(trigger).display === 'none') close();
  });
})();
