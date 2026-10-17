import type { AppContext } from '../env';

const SITEVERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstile(token: unknown, secret: string, ip?: string): Promise<boolean> {
  if (typeof token !== 'string' || !token || !secret) {
    console.log('[turnstile] missing input', { hasToken: !!token, hasSecret: !!secret });
    return false;
  }
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const outcome = await (await fetch(SITEVERIFY_ENDPOINT, { method: 'POST', body: form })).json<{ success?: boolean; 'error-codes'?: string[]; hostname?: string }>();
    if (!outcome.success) console.log('[turnstile] rejected', { 'error-codes': outcome['error-codes'], hostname: outcome.hostname });
    return outcome.success === true;
  } catch (error) {
    console.error('[turnstile] fetch error:', error);
    return false;
  }
}

export function passesTurnstile(c: AppContext, token: unknown): Promise<boolean> {
  return verifyTurnstile(token, c.env.TURNSTILE_SECRET_KEY, c.req.header('CF-Connecting-IP'));
}
