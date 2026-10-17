const APP_NAME = 'Donne Ton Point 🎯';
const DEFAULT_BODY = 'Vous avez reçu un point !';
const NOTIFICATION_ICON = '/icon-192.png';

const letNetworkHandleRequest = () => {};

function readPushMessage(event) {
  try {
    return event.data.json();
  } catch {
    return { title: APP_NAME, body: event.data.text() };
  }
}

async function focusOrOpen(targetUrl) {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((client) => new URL(client.url).pathname === targetUrl && 'focus' in client);
  if (existing) return existing.focus();
  return clients.openWindow?.(targetUrl);
}

self.addEventListener('fetch', letNetworkHandleRequest);

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const message = readPushMessage(event);
  event.waitUntil(self.registration.showNotification(message.title || APP_NAME, {
    body: message.body || DEFAULT_BODY,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: 'dtp-point',
    data: { url: message.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(focusOrOpen(event.notification.data?.url || '/'));
});
