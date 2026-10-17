import { describe, expect, it } from 'vitest';
import { pageMetadata, serializeJsonLd, structuredData } from '../../src/seo/metadata';
import { shouldStayOutOfSearchIndex } from '../../src/middleware/indexing';

describe('métadonnées des pages publiques', () => {
  it('donnent une URL canonique par langue et les alternatives hreflang', () => {
    const metadata = pageMetadata('about', 'en');
    expect(metadata.canonicalUrl).toBe('https://donnetonpoint.fr/en/about');
    expect(metadata.alternates).toEqual([
      { hreflang: 'fr', href: 'https://donnetonpoint.fr/about' },
      { hreflang: 'en', href: 'https://donnetonpoint.fr/en/about' },
      { hreflang: 'x-default', href: 'https://donnetonpoint.fr/about' },
    ]);
  });

  it('utilisent une image Open Graph PNG dimensionnée dans la bonne langue', () => {
    expect(pageMetadata('home', 'fr').image).toMatchObject({ url: 'https://donnetonpoint.fr/og-fr.png', width: 1200, height: 630 });
    expect(pageMetadata('home', 'en').ogLocale).toBe('en_US');
  });
});

describe('données structurées', () => {
  it("décrivent l'application gratuite et la FAQ de l'accueil", () => {
    const [application, faq] = structuredData('home', 'fr') as Record<string, any>[];
    expect(application).toMatchObject({ '@type': 'WebApplication', offers: { price: '0' } });
    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0].name).toContain('gratuit');
  });

  it("ne déclarent pas de FAQ hors de l'accueil", () => {
    expect(structuredData('about', 'en')).toHaveLength(1);
  });

  it('ne peuvent pas refermer la balise script', () => {
    expect(serializeJsonLd({ text: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});

describe('exclusion des moteurs de recherche', () => {
  it.each([
    ['donnetonpoint.fr', '/admin', true],
    ['donnetonpoint.fr', '/join/abc', true],
    ['donnetonpoint.fr', '/stats.html', true],
    ['compteur.pierrez.net', '/', true],
    ['give-your-point.pages.dev', '/about', true],
    ['donnetonpoint.fr', '/', false],
    ['donnetonpoint.fr', '/en/about', false],
    ['localhost:8788', '/', false],
  ])('%s%s → noindex : %s', (host, path, excluded) => {
    expect(shouldStayOutOfSearchIndex(host, path)).toBe(excluded);
  });
});
