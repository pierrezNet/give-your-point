import { describe, expect, it } from 'vitest';
import { buildDigestEmail, buildGageEmail, buildInviteEmail, buildPointEmail, buildWelcomeEmail } from '../../src/email/templates';
import { escapeHtml } from '../../src/html';

const INJECTION = '<img src=x onerror=alert(1)>';

describe('escapeHtml', () => {
  it('neutralise les caractères HTML, guillemets compris', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe("e-mail d'invitation", () => {
  it("échappe le nom de l'invitant et de l'équipe", () => {
    const { html } = buildInviteEmail({ isEn: false, inviterName: INJECTION, teamName: INJECTION, joinUrl: 'https://donnetonpoint.fr/join/abc' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('est rédigé dans la langue demandée', () => {
    expect(buildInviteEmail({ isEn: true, inviterName: 'Ann', teamName: 'Dev', joinUrl: 'u' }).subject).toContain('invites you');
    expect(buildInviteEmail({ isEn: false, inviterName: 'Ann', teamName: 'Dev', joinUrl: 'u' }).subject).toContain("t'invite");
  });
});

describe('e-mail de digest hebdomadaire', () => {
  it("échappe l'emoji du badge favori, saisi librement par l'admin", () => {
    const { html } = buildDigestEmail({
      baseUrl: 'https://donnetonpoint.fr', isEn: false, memberName: 'Ann', teamName: 'Dev',
      total: 3, topUser: null, topCat: { name: 'Entraide', emoji: INJECTION, count: 2 }, gages: 0, myReceived: 1,
    });
    expect(html).not.toContain('<img');
  });
});

describe('tous les e-mails', () => {
  const build = {
    invitation: (isEn: boolean) => buildInviteEmail({ isEn, inviterName: 'Ann & Co', teamName: 'R&D', joinUrl: 'https://donnetonpoint.fr/join/abc' }),
    point: (isEn: boolean) => buildPointEmail({ isEn, name: 'Bob', fromName: 'Ann & Co', catLabel: '🤝 Aide', baseUrl: 'https://donnetonpoint.fr' }),
    gage: (isEn: boolean) => buildGageEmail({ isEn, name: 'Bob', fromName: 'Ann & Co', catLabel: '🤝 Aide', dare: 'croissants', baseUrl: 'https://donnetonpoint.fr' }),
    bienvenue: (isEn: boolean) => buildWelcomeEmail({ isEn, name: 'Bob', teamName: 'R&D', loginUrl: 'https://donnetonpoint.fr/login/jeton' }),
    digest: (isEn: boolean) => buildDigestEmail({ baseUrl: 'https://donnetonpoint.fr', isEn, memberName: 'Bob', teamName: 'R&D', total: 3, topUser: null, topCat: null, gages: 1, myReceived: 1 }),
  };

  it.each(Object.entries(build))('%s : objet en texte brut (pas d’entités HTML)', (_, make) => {
    expect(make(false).subject).not.toContain('&amp;');
  });

  it("garde le nom de l'expéditeur tel quel dans l'objet", () => {
    expect(build.point(false).subject).toBe("🎯 Ann & Co t'a donné un point !");
  });

  it.each(Object.entries(build))('%s : contient un bouton vers donnetonpoint.fr et la mention « boîte non surveillée »', (_, make) => {
    const { html } = make(false);
    expect(html).toMatch(/<a href="https:\/\/donnetonpoint\.fr[^"]*"/);
    expect(html).toContain("n'est pas surveillée");
  });

  it.each(Object.entries(build))('%s : existe en anglais', (_, make) => {
    expect(make(true).html).toContain('not monitored');
  });

  it('le gage met en avant le texte du gage', () => {
    expect(build.gage(false).html).toContain('🚨 GAGE : croissants');
  });

  it("le gage dû à un seuil abaissé ne cite pas de donneur", () => {
    const mail = buildGageEmail({ isEn: false, name: 'Bob', fromName: null, catLabel: '🤝 Aide', dare: 'croissants', baseUrl: 'u' });
    expect(mail.html).toContain('vient d\'être abaissé');
    expect(mail.html).not.toContain('null');
  });

  it("le digest n'affiche la ligne des gages que s'il y en a", () => {
    expect(build.digest(false).html).toContain('gage(s) déclenché(s)');
    expect(buildDigestEmail({ baseUrl: 'u', isEn: false, memberName: 'Bob', teamName: 'Dev', total: 3, topUser: null, topCat: null, gages: 0, myReceived: 0 }).html)
      .not.toContain('gage(s)');
  });
});
