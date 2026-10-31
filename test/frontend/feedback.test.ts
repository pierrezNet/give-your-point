import { describe, expect, it } from 'vitest';
import { FEEDBACK_TYPES, FORUM_URL, counterText, feedbackErrorHtml, feedbackFormHtml, feedbackSentHtml } from '../../public/js/features/feedback/view.js';

describe('formulaire « J\'ai un retour »', () => {
  const html = feedbackFormHtml();

  it('relie chaque champ à son libellé', () => {
    for (const id of ['feedback-type', 'feedback-message', 'feedback-pseudo', 'feedback-contact']) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('propose les quatre types, avec les limites du serveur', () => {
    for (const type of FEEDBACK_TYPES) expect(html).toContain(`value="${type}"`);
    expect(html).toContain('maxlength="1800"');
    expect(html).toContain('maxlength="40"');
    expect(html).toContain('maxlength="120"');
  });

  it("annonce les erreurs et décrit le compteur du message", () => {
    expect(html).toContain('id="feedback-error" class="text-sm text-red-600 hidden" role="alert"');
    expect(html).toContain('aria-describedby="feedback-counter"');
    expect(counterText(12)).toBe('12 / 1800');
  });

  it('renvoie vers le forum après envoi, et en cas d\'échec', () => {
    expect(feedbackSentHtml()).toContain(`href="${FORUM_URL}"`);
    expect(feedbackErrorHtml('Échec.')).toContain(`href="${FORUM_URL}"`);
  });
});
