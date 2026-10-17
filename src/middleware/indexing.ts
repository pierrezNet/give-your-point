import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { CANONICAL_ORIGIN } from '../seo/metadata';

const CANONICAL_HOST = new URL(CANONICAL_ORIGIN).host;
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
const PRIVATE_PATHS = /^\/(admin|superadmin|owner|stats|join|login|api)(\/|\.html|$)/;

export function shouldStayOutOfSearchIndex(host: string, path: string): boolean {
  const isSecondaryHost = host !== CANONICAL_HOST && !LOCAL_HOST_PATTERN.test(host);
  return isSecondaryHost || PRIVATE_PATHS.test(path);
}

export const searchIndexing: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const url = new URL(c.req.url);
  if (!shouldStayOutOfSearchIndex(url.host, url.pathname)) return;
  const response = new Response(c.res.body, c.res);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  c.res = response;
};
