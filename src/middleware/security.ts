import type { ErrorHandler, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../http/errors';

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const response = new Response(c.res.body, c.res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  c.res = response;
};

export const canonicalHost: MiddlewareHandler<AppEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  if (!url.hostname.startsWith('www.')) return next();
  url.hostname = url.hostname.slice('www.'.length);
  return c.redirect(url.toString(), 301);
};

export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof SyntaxError) return apiError(c, 'INVALID_REQUEST');
  console.error(error);
  return apiError(c, 'INTERNAL');
};
