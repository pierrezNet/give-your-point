const handlers = new Map();
let listening = false;

function dispatch(event) {
  const trigger = event.target.closest('[data-action]');
  const handler = trigger && handlers.get(trigger.dataset.action);
  if (!handler) return;
  event.preventDefault();
  handler(trigger, event);
}

export function registerActions(actions) {
  if (!listening) document.addEventListener('click', dispatch);
  listening = true;
  for (const [name, handler] of Object.entries(actions)) handlers.set(name, handler);
}
