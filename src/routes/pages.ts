import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../env';
import { renderPublicPage } from '../seo/rewrite';
import type { Language, PublicPage } from '../seo/metadata';

const ALWAYS_REVALIDATED_ASSET = /\.(js|css)$/;
const PAGE_ASSETS: Record<PublicPage, string> = { home: '/', about: '/about' };

async function fetchAsset(c: AppContext, path: string): Promise<Response> {
  return c.env.ASSETS.fetch(new Request(new URL(path, c.req.url).toString(), { method: 'GET', headers: c.req.raw.headers }));
}

async function servePublicPage(c: AppContext, page: PublicPage, language: Language): Promise<Response> {
  const asset = await fetchAsset(c, PAGE_ASSETS[page]);
  if (!(asset.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html')) return asset;
  return renderPublicPage(asset, page, language);
}

export const pageRoutes = new Hono<AppEnv>();

pageRoutes.get('/', (c) => servePublicPage(c, 'home', 'fr'));
pageRoutes.get('/about', (c) => servePublicPage(c, 'about', 'fr'));
pageRoutes.get('/about.html', (c) => c.redirect('/about', 301));
pageRoutes.get('/en', (c) => c.redirect('/en/', 301));
pageRoutes.get('/en/', (c) => servePublicPage(c, 'home', 'en'));
pageRoutes.get('/en/about', (c) => servePublicPage(c, 'about', 'en'));
pageRoutes.get('/join/:code', (c) => fetchAsset(c, '/'));

pageRoutes.get('/*', async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (!ALWAYS_REVALIDATED_ASSET.test(c.req.path)) return asset;
  const revalidated = new Response(asset.body, asset);
  revalidated.headers.set('Cache-Control', 'no-cache');
  return revalidated;
});
