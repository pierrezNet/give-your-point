import { postJson } from '../../core/session.js';

export async function fetchVapidPublicKey() {
  const response = await fetch('/api/push/vapid-key');
  return response.ok ? (await response.json()).publicKey : null;
}

export const registerSubscription = (subscription) =>
  postJson('/api/push/subscribe', { endpoint: subscription.endpoint, keys: subscription.toJSON().keys });
