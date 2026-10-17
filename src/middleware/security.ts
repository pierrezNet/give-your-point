import type { ErrorHandler, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../http/errors';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' ${TURNSTILE_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  `frame-src ${TURNSTILE_ORIGIN}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
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
