import { describe, expect, it } from 'vitest';
import { t, tText, hasTranslation } from '../../public/js/core/i18n.js';
import { escapeHtml } from '../../public/js/core/html.js';
import { apiErrorMessage } from '../../public/js/core/api.js';

describe('traduction', () => {
  it("t() échappe les paramètres destinés au HTML", () => {
    expect(t('history.title', { name: '<img src=x>' })).toBe('Historique de &lt;img src=x&gt;');
  });

  it('tText() laisse les paramètres intacts pour un affichage en texte', () => {
    expect(tText('history.title', { name: 'Ann & Co' })).toBe('Historique de Ann & Co');
  });

  it('retombe sur la clé quand la traduction manque', () => {
    expect(t('cle.inexistante')).toBe('cle.inexistante');
    expect(hasTranslation('cle.inexistante')).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('neutralise tous les caractères spéciaux', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('accepte null et les nombres', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(3)).toBe('3');
  });
});

describe("messages d'erreur de l'API", () => {
  it('traduisent le code avec ses paramètres', () => {
    expect(apiErrorMessage({ code: 'RECIPIENT_DAILY_LIMIT', params: { name: 'Bob', max: 3 }, error: 'x' }, 'common.error'))
      .toBe("Tu as déjà bien félicité Bob aujourd'hui (3 max) 😄");
  });

  it('retombent sur le message du serveur pour un code inconnu, puis sur la clé de repli', () => {
    expect(apiErrorMessage({ code: 'INCONNU', error: 'message serveur' }, 'common.error')).toBe('message serveur');
    expect(apiErrorMessage(null, 'common.error')).toBe('Erreur');
  });
});
