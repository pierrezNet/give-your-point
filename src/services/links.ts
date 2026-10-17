import type { AppContext } from '../env';

const CANONICAL_BASE_URL = 'https://donnetonpoint.fr';
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

export function appBaseUrl(c: AppContext): string {
  if (c.env.APP_BASE_URL) return c.env.APP_BASE_URL;
  const host = c.req.header('Host') || '';
  return LOCAL_HOST_PATTERN.test(host) ? `http://${host}` : CANONICAL_BASE_URL;
}

export const magicLinkUrl = (c: AppContext, token: string) => `${appBaseUrl(c)}/login/${token}`;
export const joinUrl = (c: AppContext, inviteCode: string) => `${appBaseUrl(c)}/join/${inviteCode}`;
