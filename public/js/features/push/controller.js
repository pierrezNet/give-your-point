import { getSessionToken } from '../../core/session.js';
import { fetchVapidPublicKey, registerSubscription } from './api.js';

function base64UrlToBytes(value) {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

const isPushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const canAskForPush = () => isPushSupported() && Notification.permission === 'default';

export async function startPushNotifications() {
  if (!isPushSupported() || !getSessionToken()) return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const existing = await registration.pushManager.getSubscription();
    if (existing) await registerSubscription(existing);
  } catch (error) {
    console.info('Push indisponible :', error.message);
  }
}

export async function enablePushNotifications() {
  const publicKey = await fetchVapidPublicKey();
  if (!publicKey || await Notification.requestPermission() !== 'granted') return false;
  const registration = await navigator.serviceWorker.register('/sw.js');
  await registerSubscription(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  return true;
}
