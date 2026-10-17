const handlers = new Map();

export function registerActions(actions) {
  for (const [name, handler] of Object.entries(actions)) handlers.set(name, handler);
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-action]');
  const handler = trigger && handlers.get(trigger.dataset.action);
  if (!handler) return;
  event.preventDefault();
  handler(trigger, event);
});
