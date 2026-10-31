import { describe, expect, it } from 'vitest';
import { FEEDBACK_MESSAGE_MAX_LENGTH, parseFeedback } from '../../src/domain/feedback';

const valid = { type: 'suggestion', message: '  Un mode sombre ?  ' };

describe('parseFeedback', () => {
  it('nettoie les champs et traduit le type en libellé du forum', () => {
    expect(parseFeedback({ ...valid, pseudo: '  Ann   Lee ', contact: ' a@b.fr ' })).toEqual({
      type: 'Suggestion / idée', message: 'Un mode sombre ?', pseudo: 'Ann Lee', contact: 'a@b.fr', lang: 'fr',
    });
  });

  it("garde l'anglais, et ramène toute autre langue au français", () => {
    expect(parseFeedback({ ...valid, lang: 'en' })?.lang).toBe('en');
    expect(parseFeedback({ ...valid, lang: 'de' })?.lang).toBe('fr');
  });

  it.each([
    [{ ...valid, type: 'toString' }],
    [{ ...valid, type: 'Bug' }],
    [{ ...valid, message: '   ' }],
    [{ ...valid, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX_LENGTH + 1) }],
    [{ ...valid, pseudo: 'x'.repeat(41) }],
    [{ ...valid, contact: 'x'.repeat(121) }],
    [{ ...valid, message: 42 }],
  ])('refuse %j', (body) => {
    expect(parseFeedback(body)).toBeNull();
  });
});
