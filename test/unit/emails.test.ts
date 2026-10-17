import { describe, expect, it } from 'vitest';
import { buildDigestEmail, buildInviteEmail } from '../../src/email/templates';
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
