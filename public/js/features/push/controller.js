import { getSessionToken } from '../../core/session.js';
import { fetchVapidPublicKey, registerSubscription } from './api.js';

const PERMISSION_PROMPT_DELAY_MS = 3000;

function base64UrlToBytes(value) {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function askPermissionAndSubscribe(registration, publicKey) {
  if (await Notification.requestPermission() !== 'granted') return;
  await registerSubscription(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
}

export async function startPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !getSessionToken()) return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return;
    const existing = await registration.pushManager.getSubscription();
    if (existing) await registerSubscription(existing);
    else setTimeout(() => askPermissionAndSubscribe(registration, publicKey), PERMISSION_PROMPT_DELAY_MS);
  } catch (error) {
    console.info('Push indisponible :', error.message);
  }
}
