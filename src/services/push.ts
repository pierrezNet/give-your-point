import type { Bindings } from '../env';
import { decodeb64url, encryptPushPayload, vapidJwt } from '../push/crypto';

const PUSH_SERVICE_DOMAINS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
const MAX_PUSH_ENDPOINT_LENGTH = 2048;
const MAX_PUSH_KEY_LENGTH = 256;
const PUSH_TTL_SECONDS = '60';
const EXPIRED_SUBSCRIPTION_STATUSES = new Set([404, 410]);
const FALLBACK_VAPID_SUBJECT = 'mailto:admin@example.com';

export function isKnownPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:'
      && PUSH_SERVICE_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function isPushKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PUSH_KEY_LENGTH;
}

interface PushSubscriptionRow { id: number; endpoint: string; p256dh: string; auth: string }

export async function sendPushToUser(env: Bindings, toUserId: string, fromUserName: string, categoryId: string): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK) return;

  const [subscriptions, category] = await Promise.all([
    env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').bind(toUserId).all<PushSubscriptionRow>(),
    env.DB.prepare('SELECT name, emoji FROM categories WHERE id = ?').bind(categoryId).first<{ name: string; emoji: string }>(),
  ]);
  if (!subscriptions.results?.length) return;

  const privateKeyJwk: JsonWebKey = JSON.parse(new TextDecoder().decode(decodeb64url(env.VAPID_PRIVATE_KEY_JWK)));
  const badgeLabel = category ? `${category.emoji} ${category.name}` : 'un badge';
  const payload = JSON.stringify({
    title: '🎯 Donne Ton Point',
    body: `${fromUserName} t'a donné un point pour ${badgeLabel} !`,
    url: '/',
  });

  await Promise.all(subscriptions.results.map(async (subscription) => {
    try {
      const jwt = await vapidJwt(subscription.endpoint, env.VAPID_SUBJECT || FALLBACK_VAPID_SUBJECT, privateKeyJwk);
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          Authorization: `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
          TTL: PUSH_TTL_SECONDS,
        },
        body: await encryptPushPayload(payload, subscription.p256dh, subscription.auth),
      });
      if (EXPIRED_SUBSCRIPTION_STATUSES.has(response.status)) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id).run();
      }
    } catch (error) {
      console.error('Push send error:', error);
    }
  }));
}
