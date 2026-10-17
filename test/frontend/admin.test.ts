import { describe, expect, it } from 'vitest';
import { maskEmail, memberRowHtml, pendingBannerHtml, spamBannerHtml, spamWatchlist } from '../../public/js/features/admin/members.view.js';
import { ruleHtml } from '../../public/js/features/admin/rules.view.js';
import { dareLogHtml } from '../../public/js/features/admin/logs.view.js';

const member = { id: 'u1', name: 'Bob', active: 1, has_activity: 1, email: null, email_verified: 0 };
const context = { dares: [], categories: [] };

describe('ligne de membre', () => {
  it("propose lien, régénération et désactivation pour un membre actif sans e-mail", () => {
    const html = memberRowHtml(member, context);
    expect(html).toContain('data-action="copy-link"');
    expect(html).toContain('data-action="regenerate-link"');
    expect(html).toContain('data-action="deactivate-member"');
  });

  it("propose le renvoi par e-mail quand le membre en a un", () => {
    expect(memberRowHtml({ ...member, email: 'bob@example.com' }, context)).toContain('data-action="resend-link"');
  });

  it('distingue un inscrit en attente (valider / rejeter) d’un membre désactivé (restaurer)', () => {
    const pending = memberRowHtml({ ...member, active: 0, has_activity: 0 }, context);
    expect(pending).toContain('en attente');
    expect(pending).toContain('data-action="reject-member"');
    const deactivated = memberRowHtml({ ...member, active: 0, has_activity: 1 }, context);
    expect(deactivated).not.toContain('data-action="reject-member"');
    expect(deactivated).toContain('data-action="restore-member"');
    expect(deactivated).toContain('Réactiver');
  });

  it('affiche un bouton de remise à zéro par gage actif', () => {
    const html = memberRowHtml(member, {
      dares: [{ userId: 'u1', categoryId: 'c1' }],
      categories: [{ id: 'c1', name: 'Blague', emoji: '😂' }, { id: 'c2', name: 'Aide', emoji: '🤝' }],
    });
    expect(html.match(/data-action="clear-dare"/g)).toHaveLength(1);
  });

  it('échappe le nom', () => {
    expect(memberRowHtml({ ...member, name: '<img src=x>' }, context)).not.toContain('<img');
  });
});

describe('outils de la console', () => {
  it("masque l'adresse e-mail", () => {
    expect(maskEmail('bob.martin@example.com')).toBe('bo…@…com');
  });

  it("n'affiche le bandeau d'attente que s'il y a des inscrits", () => {
    expect(pendingBannerHtml(0)).toBe('');
    expect(pendingBannerHtml(2)).toContain('2');
  });

  it('surveille les spammeurs signalés et ceux à mi-chemin', () => {
    const watched = spamWatchlist([
      { userId: 'a', name: 'A', progress: 1.2, flagged: true },
      { userId: 'b', name: 'B', progress: 0.6, flagged: false },
      { userId: 'c', name: 'C', progress: 0.2, flagged: false },
    ]);
    expect(watched.map((spammer: { userId: string }) => spammer.userId)).toEqual(['a', 'b']);
    const html = spamBannerHtml(watched);
    expect(html).toContain('aria-valuenow="100"');
    expect(html.match(/pardon-spammer/g)).toHaveLength(1);
  });
});

describe('règles et historique des gages', () => {
  it('rendent les textes saisis échappés', () => {
    const rule = ruleHtml({ id: 'r1', cat_emoji: '😂', cat_name: 'Blague', threshold: 3, dare_text: '"><script>' });
    expect(rule).not.toContain('<script>');
    expect(rule).toContain('data-rule-id="r1"');
  });

  it("indique un historique vide", () => {
    expect(dareLogHtml([])).toContain('Aucun gage');
  });
});
