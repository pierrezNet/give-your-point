import { getSessionToken, postJson } from '../core/session.js';

const PERMISSION_PROMPT_DELAY_MS = 3000;

function base64UrlToBytes(value) {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

const register = (subscription) =>
  postJson('/api/push/subscribe', { endpoint: subscription.endpoint, keys: subscription.toJSON().keys });

export async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !getSessionToken()) return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const { publicKey } = await (await fetch('/api/push/vapid-key')).json();
    if (!publicKey) return;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await register(existing);
      return;
    }
    setTimeout(async () => {
      if (await Notification.requestPermission() !== 'granted') return;
      await register(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
    }, PERMISSION_PROMPT_DELAY_MS);
  } catch (error) {
    console.info('Push indisponible :', error.message);
  }
}
