import { describe, expect, it } from 'vitest';
import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import app from '../src/app';

const PAGE = `<!DOCTYPE html><html lang="fr"><head>
<title>FR</title><meta name="description" content="fr"><link rel="canonical" href="https://donnetonpoint.fr/">
<meta property="og:title" content=""><meta property="og:image" content=""><meta property="og:url" content="">
</head><body>
<h1 data-i18n="app.title">Donne Ton Point</h1>
<input data-i18n-placeholder="onboarding.admin_placeholder" placeholder="Ton prénom">
<a href="/about">À propos</a>
</body></html>`;

const assets = { fetch: async () => new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) };

const get = (path: string, host = 'donnetonpoint.fr') =>
  app.request(`https://${host}${path}`, {}, { ...env, ASSETS: assets }, createExecutionContext());

describe('pages publiques', () => {
  it("servent l'accueil en français avec ses métadonnées et ses données structurées", async () => {
    const html = await (await get('/')).text();
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("<title>Donne Ton Point — Le rituel d'équipe</title>");
    expect(html).toContain('hreflang="en" href="https://donnetonpoint.fr/en/"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('href="/about"');
  });

  it('remplissent aussi en français les textes définis dans le dictionnaire', async () => {
    const html = await (await get('/')).text();
    expect(html).toContain('placeholder="Ton prénom"');
  });

  it("servent l'accueil anglais traduit côté serveur", async () => {
    const html = await (await get('/en/')).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1 data-i18n="app.title">Give Your Point</h1>');
    expect(html).toContain('placeholder="Your first name"');
    expect(html).toContain('href="/en/about"');
    expect(html).toContain('<link rel="canonical" href="https://donnetonpoint.fr/en/">');
    expect(html).toContain('content="https://donnetonpoint.fr/og-en.png"');
  });

  it('servent la page À propos en anglais', async () => {
    expect(await (await get('/en/about')).text()).toContain('<title>About — Give Your Point</title>');
  });

  it('redirigent /en et /about.html vers leur adresse canonique', async () => {
    expect((await get('/en')).headers.get('Location')).toBe('/en/');
    expect((await get('/about.html')).headers.get('Location')).toBe('/about');
  });

  it('sont indexables sur le domaine principal mais pas sur les domaines secondaires', async () => {
    expect((await get('/')).headers.get('X-Robots-Tag')).toBeNull();
    expect((await get('/', 'compteur.pierrez.net')).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it("excluent les invitations de l'index", async () => {
    expect((await get('/join/abc')).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
