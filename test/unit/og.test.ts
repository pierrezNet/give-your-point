import { describe, expect, it } from 'vitest';
import { fillOgPlaceholders, languageFromAcceptLanguage, ogDataFor } from '../../src/og';

describe('languageFromAcceptLanguage', () => {
  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['EN', 'en'],
    ['fr-FR,fr;q=0.9,en;q=0.8', 'fr'],
    ['de-DE', 'fr'],
    [undefined, 'fr'],
  ])('« %s » → %s', (header, language) => {
    expect(languageFromAcceptLanguage(header)).toBe(language);
  });
});

describe('fillOgPlaceholders', () => {
  it('remplace tous les marqueurs et échappe les valeurs', () => {
    const html = '<title>{{OG_TITLE}}</title><meta content="{{OG_DESC}}"><meta content="{{OG_URL}}"><meta content="{{OG_LOCALE}}">';
    const filled = fillOgPlaceholders(html, { title: 'A & B', desc: '"citation"', locale: 'fr_FR' }, 'https://donnetonpoint.fr');
    expect(filled).toBe('<title>A &amp; B</title><meta content="&quot;citation&quot;"><meta content="https://donnetonpoint.fr"><meta content="fr_FR">');
  });

  it('fournit des données pour chaque page et chaque langue', () => {
    expect(ogDataFor('/about', 'en').locale).toBe('en_US');
    expect(ogDataFor('/', 'fr').title).toContain('Donne Ton Point');
  });
});
