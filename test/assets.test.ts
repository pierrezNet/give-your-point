import { describe, expect, it } from 'vitest';
import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import app from '../src/app';

const assets = {
  fetch: async (request: Request) => new URL(request.url).pathname.endsWith('.html')
    ? Response.redirect(new URL('/about', request.url).toString(), 308)
    : new Response('contenu', { headers: { 'Cache-Control': 'public, max-age=14400' } }),
};

const getAsset = (path: string) =>
  app.request(`https://donnetonpoint.test${path}`, {}, { ...env, ASSETS: assets }, createExecutionContext());

describe('fichiers statiques', () => {
  it('font revalider scripts et feuilles de style à chaque chargement', async () => {
    expect((await getAsset('/app.js')).headers.get('Cache-Control')).toBe('no-cache');
    expect((await getAsset('/styles.css')).headers.get('Cache-Control')).toBe('no-cache');
  });

  it('laissent les images en cache', async () => {
    expect((await getAsset('/icon-192.png')).headers.get('Cache-Control')).toBe('public, max-age=14400');
  });

  it('reçoivent les en-têtes de sécurité', async () => {
    expect((await getAsset('/app.js')).headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('relaient les redirections de Cloudflare (en-têtes immuables) sans erreur', async () => {
    const response = await getAsset('/about.html');
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('https://donnetonpoint.test/about');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
