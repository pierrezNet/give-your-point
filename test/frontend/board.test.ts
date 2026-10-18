import { describe, expect, it } from 'vitest';
import { categoryButtonsHtml, dareAnnouncementHtml, pointOutcomeMessage, pointToastHtml, userCardHtml } from '../../public/js/features/board/view.js';

const user = { id: 'u1', name: 'Bob', rank: 1, total_points: 4, topCategories: [{ emoji: '😂', count: 4 }], gage: null, spammer: false };

describe('carte de membre', () => {
  it('affiche nom, points, rang et badges', () => {
    const html = userCardHtml(user, { isMe: false });
    expect(html).toContain('data-user-id="u1"');
    expect(html).toContain('>Bob ');
    expect(html).toContain('4 pts');
    expect(html).toContain('#1');
    expect(html).toContain('bg-yellow-400');
  });

  it('offre un bouton nommé pour donner le badge au clavier', () => {
    expect(userCardHtml(user, { isMe: false })).toContain('aria-label="Donner le badge sélectionné à Bob"');
    expect(userCardHtml(user, { isMe: true })).toContain('aria-disabled="true"');
  });

  it("marque la carte de l'utilisateur courant", () => {
    const html = userCardHtml(user, { isMe: true });
    expect(html).toContain('data-is-me="true"');
    expect(html).toContain('(toi)');
    expect(html).toContain('cursor-not-allowed');
  });

  it('échappe le nom du membre', () => {
    const html = userCardHtml({ ...user, name: '<img src=x onerror=alert(1)>' }, { isMe: false });
    expect(html).not.toContain('<img');
  });

  it('affiche les bandeaux gage et spammeur', () => {
    const html = userCardHtml({ ...user, gage: 'croissants', spammer: true }, { isMe: false });
    expect(html).toContain('CROISSANTS');
    expect(html).toContain('spammer-banner');
    expect(html).toContain('gage-active');
  });

  it('indique l’absence de badge', () => {
    expect(userCardHtml({ ...user, topCategories: [] }, { isMe: false })).toContain('Aucun badge');
  });
});

describe('badges à offrir', () => {
  it("expliquent quoi faire quand l'équipe n'a encore aucun badge", () => {
    expect(categoryButtonsHtml([])).toContain('un admin peut en créer');
  });

  it('rendent un bouton accessible et glissable par badge', () => {
    const html = categoryButtonsHtml([{ id: 'c1', emoji: '🤝', name: '<b>Entraide</b>' }]);
    expect(html).toContain('data-category-id="c1"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('&lt;b&gt;Entraide');
  });
});

describe('toast après un don', () => {
  it("propose d'ajouter un mot et d'annuler (avec le délai) pour un succès, rien pour une erreur", () => {
    expect(pointToastHtml('ok', 'success')).toContain('add-point-reason');
    expect(pointToastHtml('ok', 'success')).toContain('Annuler (15 s)');
    expect(pointToastHtml('ko', 'error')).not.toContain('undo-last-point');
  });

  it('échappe le message', () => {
    expect(pointToastHtml('<script>', 'error')).toContain('&lt;script&gt;');
  });

  it('choisit le message selon le résultat du don', () => {
    expect(pointOutcomeMessage({ gageTriggered: { name: 'Bob', dare: 'pizza' } })).toEqual({ type: 'danger', message: '🚨 Gage activé pour Bob : pizza !' });
    expect(pointOutcomeMessage({ gageWarning: { name: 'Bob' } }).type).toBe('warning');
    expect(pointOutcomeMessage({}).type).toBe('success');
  });
});

describe("annonce d'un gage à l'équipe", () => {
  it('nomme le membre et son gage, en échappant les données', () => {
    const html = dareAnnouncementHtml([{ name: '<b>Bob</b>', dare: 'croissants' }]);
    expect(html).toContain("&lt;b&gt;Bob&lt;/b&gt; écope d'un gage : croissants");
    expect(html).toContain('aria-live="polite"');
  });
});
