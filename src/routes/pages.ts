import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../env';
import { fillOgPlaceholders, languageFromAcceptLanguage, ogDataFor, type OgPage } from '../og';

const ALWAYS_REVALIDATED_ASSET = /\.(js|css)$/;
const DEFAULT_HTML_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

async function serveHtmlWithOg(c: AppContext, page: OgPage, assetPath?: string): Promise<Response> {
  const request = assetPath
    ? new Request(new URL(assetPath, c.req.url).toString(), { method: 'GET', headers: c.req.raw.headers })
    : c.req.raw;
  const asset = await c.env.ASSETS.fetch(request);
  if (!(asset.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html')) return asset;

  const og = ogDataFor(page, languageFromAcceptLanguage(c.req.header('Accept-Language')));
  return new Response(fillOgPlaceholders(await asset.text(), og, new URL(c.req.url).origin), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': asset.headers.get('Cache-Control') ?? DEFAULT_HTML_CACHE_CONTROL,
    },
  });
}

export const pageRoutes = new Hono<AppEnv>();

pageRoutes.get('/', (c) => serveHtmlWithOg(c, '/'));
pageRoutes.get('/about', (c) => serveHtmlWithOg(c, '/about'));
pageRoutes.get('/about.html', (c) => serveHtmlWithOg(c, '/about'));
pageRoutes.get('/join/:code', (c) => serveHtmlWithOg(c, '/', '/'));

pageRoutes.get('/*', async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (!ALWAYS_REVALIDATED_ASSET.test(c.req.path)) return asset;
  const revalidated = new Response(asset.body, asset);
  revalidated.headers.set('Cache-Control', 'no-cache');
  return revalidated;
});
