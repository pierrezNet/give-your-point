import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeDareText, normalizeEmoji, normalizeName, normalizeOptionalEmail, normalizeThreshold } from '../../src/domain/validation';

describe('isValidEmail', () => {
  it.each(['ann@example.com', 'a.b+c@sub.example.fr'])('accepte %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'ann', 'ann@', '@example.com', 'ann@example', 'ann @example.com'])('refuse « %s »', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('normalizeOptionalEmail', () => {
  it("renvoie l'adresse sans espaces autour", () => {
    expect(normalizeOptionalEmail('  ann@example.com ')).toBe('ann@example.com');
  });

  it.each([undefined, null, 42, '', '   ', 'pas-un-email'])('renvoie null pour %p', (raw) => {
    expect(normalizeOptionalEmail(raw)).toBeNull();
  });
});

describe('normalizeName', () => {
  it('nettoie les espaces', () => {
    expect(normalizeName('  Ann ')).toBe('Ann');
  });

  it('applique la longueur maximale par défaut (40)', () => {
    expect(normalizeName('a'.repeat(40))).toHaveLength(40);
    expect(normalizeName('a'.repeat(41))).toBeNull();
  });

  it('applique des bornes personnalisées', () => {
    expect(normalizeName('A', { min: 2 })).toBeNull();
    expect(normalizeName('a'.repeat(60), { max: 60 })).toHaveLength(60);
  });

  it.each([undefined, null, 42, {}, '', '   '])('renvoie null pour %p', (raw) => {
    expect(normalizeName(raw)).toBeNull();
  });
});

describe('normalizeThreshold', () => {
  it.each([[3, 3], ['12', 12], [' 7 ', 7], [1000, 1000]])('%p → %p', (raw, expected) => {
    expect(normalizeThreshold(raw)).toBe(expected);
  });

  it.each([0, -1, 1001, 2.5, 'abc', '', null, undefined])('refuse %p', (raw) => {
    expect(normalizeThreshold(raw)).toBeNull();
  });
});

describe('normalizeEmoji et normalizeDareText', () => {
  it('acceptent des valeurs raisonnables', () => {
    expect(normalizeEmoji(' 👩‍💻 ')).toBe('👩‍💻');
    expect(normalizeDareText('Apporter des croissants')).toBe('Apporter des croissants');
  });

  it('bornent la longueur', () => {
    expect(normalizeEmoji('x'.repeat(17))).toBeNull();
    expect(normalizeDareText('x'.repeat(141))).toBeNull();
  });
});
