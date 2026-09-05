// Local specimen interactions: no network, API, storage or billing side effects.
const status = document.querySelector('#specimen-status');
const disclosures = [...document.querySelectorAll('button[data-disclosure]')];
function close(trigger, restore = false) {
  trigger.setAttribute('aria-expanded', 'false');
  document.getElementById(trigger.getAttribute('aria-controls')).hidden = true;
  if (restore) trigger.focus();
}
for (const trigger of disclosures) {
  trigger.addEventListener('click', () => {
    const open = trigger.getAttribute('aria-expanded') !== 'true';
    for (const other of disclosures) close(other);
    trigger.setAttribute('aria-expanded', String(open));
    document.getElementById(trigger.getAttribute('aria-controls')).hidden = !open;
  });
}
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const trigger = disclosures.find(t => t.getAttribute('aria-expanded') === 'true');
  if (trigger) { event.preventDefault(); close(trigger, true); }
});
function closeOutside(target) {
  for (const trigger of disclosures) {
    const panel = document.getElementById(trigger.getAttribute('aria-controls'));
    if (!trigger.contains(target) && !panel.contains(target)) close(trigger);
  }
}
document.addEventListener('click', event => closeOutside(event.target));
document.addEventListener('focusin', event => closeOutside(event.target));
window.addEventListener('resize', () => {
  for (const trigger of disclosures) {
    if (getComputedStyle(trigger).display === 'none' || !trigger.getClientRects().length) close(trigger);
  }
});
document.querySelectorAll('a[data-demo-link]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  for (const trigger of disclosures) close(trigger);
  status.textContent = `Preview destination: ${link.dataset.demoLink}. This specimen does not navigate to the product.`;
  status.focus();
}));
document.querySelectorAll('[data-topic]').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('[data-topic]').forEach(other => other.removeAttribute('aria-current'));
  link.setAttribute('aria-current', 'location');
}));
document.querySelector('#run-example').addEventListener('click', event => {
  const button = event.currentTarget;
  if (button.getAttribute('aria-disabled') === 'true') return;
  button.setAttribute('aria-disabled', 'true');
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Load example';
  const feedback = document.querySelector('#example-feedback');
  feedback.textContent = 'Loading a local design fixture.';
  setTimeout(() => {
    button.removeAttribute('aria-disabled');
    button.removeAttribute('aria-busy');
    button.textContent = 'Load example';
    feedback.textContent = 'Example loaded. No tool was called.';
  }, 900);
});
document.querySelector('#retry-example').addEventListener('click', () => {
  document.querySelector('#retry-feedback').textContent = 'Retry example complete. No request was sent.';
});
