export function track(event) {
  const body = JSON.stringify({ event });
  if (navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }))) return;
  fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => null);
}
