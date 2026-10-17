import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { API_ERROR_CODES, errorMessage } from '../../src/http/errors';

function translationKeys(language: 'fr' | 'en'): Set<string> {
  const source = env.FRONTEND_TRANSLATIONS;
  const start = source.indexOf(`  ${language}: {`);
  const end = source.indexOf('\n  },', start);
  return new Set([...source.slice(start, end).matchAll(/^\s+'([^']+)':/gm)].map((match) => match[1]));
}

describe("codes d'erreur de l'API", () => {
  it.each(['fr', 'en'] as const)('ont tous une traduction dans le frontend (%s)', (language) => {
    const keys = translationKeys(language);
    expect(API_ERROR_CODES.filter((code) => !keys.has(`errors.${code}`))).toEqual([]);
  });

  it('interpolent leurs paramètres', () => {
    expect(errorMessage('RECIPIENT_DAILY_LIMIT', { name: 'Bob', max: 3 })).toBe("Tu as déjà bien félicité Bob aujourd'hui (3 max) 😄");
  });

  it('laissent visibles les paramètres manquants', () => {
    expect(errorMessage('DAILY_LIMIT')).toContain('{max}');
  });
});
