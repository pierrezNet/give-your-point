import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import app from '../src/app';
import { CATEGORY_HELP, seedDatabase, TEAM_ACME_DEV, USERS } from './fixtures';

beforeEach(seedDatabase);
afterEach(() => vi.restoreAllMocks());

interface SentEmail { to: string; subject: string; html: string }

async function requestCapturingEmails(path: string, init: RequestInit): Promise<SentEmail[]> {
  const sent: SentEmail[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, requestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.resend.com/')) sent.push(JSON.parse(String(requestInit?.body)));
    return Response.json({ id: 'email' });
  });
  const ctx = createExecutionContext();
  const mailEnv = { ...env, RESEND_API_KEY: 'resend-test', RESEND_FROM_EMAIL: 'noreply@donnetonpoint.test' };
  await app.request(`https://donnetonpoint.test${path}`, init, mailEnv, ctx);
  await waitOnExecutionContext(ctx);
  return sent;
}

describe('e-mails contenant un lien magique', () => {
  it("le changement d'adresse envoie un lien qui contient le jeton, pas l'id", async () => {
    const [mail] = await requestCapturingEmails('/api/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${USERS.alice.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com' }),
    });
    expect(mail.to).toBe('alice@example.com');
    expect(mail.html).toContain(`/login/${USERS.alice.token}`);
    expect(mail.html).not.toContain(USERS.alice.id);
  });

  it('le renvoi de lien par un admin contient le jeton du membre', async () => {
    await env.DB.prepare("UPDATE users SET email = 'bob@example.com' WHERE id = ?").bind(USERS.bob.id).run();
    const [mail] = await requestCapturingEmails(`/api/admin/users/${USERS.bob.id}/resend-link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${USERS.admin.token}` },
    });
    expect(mail.html).toContain(`/login/${USERS.bob.token}`);
  });
});

describe('e-mails de gage', () => {
  const adminRequest = (method: string, body?: unknown) => ({
    method,
    headers: { Authorization: `Bearer ${USERS.admin.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET email = 'bob@example.com', email_verified = 1 WHERE id = ?").bind(USERS.bob.id),
      env.DB.prepare("INSERT INTO dare_rules (id, team_id, category_id, threshold, dare_text) VALUES ('rule', ?, ?, 5, 'croissants')").bind(TEAM_ACME_DEV, CATEGORY_HELP),
      env.DB.prepare('INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id) VALUES (?1, ?2, ?3, ?4), (?1, ?2, ?3, ?4), (?1, ?2, ?3, ?4)')
        .bind(TEAM_ACME_DEV, USERS.alice.id, USERS.bob.id, CATEGORY_HELP),
    ]);
  });

  it('prévient le membre quand un seuil abaissé sous son compteur le met en gage', async () => {
    const [mail, ...others] = await requestCapturingEmails('/api/admin/rules/rule', adminRequest('PATCH', { threshold: 2, dare_text: 'croissants' }));
    expect(others).toEqual([]);
    expect(mail.to).toBe('bob@example.com');
    expect(mail.html).toContain('abaissé');
  });

  it('ne prévient personne quand le seuil monte', async () => {
    expect(await requestCapturingEmails('/api/admin/rules/rule', adminRequest('PATCH', { threshold: 8, dare_text: 'croissants' }))).toEqual([]);
  });
});

describe("validation d'un inscrit", () => {
  it('envoie son lien de connexion à l\'inscrit qui a laissé son e-mail', async () => {
    await env.DB.prepare("UPDATE users SET active = 0, email = 'bob@example.com' WHERE id = ?").bind(USERS.bob.id).run();
    const [mail] = await requestCapturingEmails(`/api/admin/users/${USERS.bob.id}/restore`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${USERS.admin.token}` },
    });
    expect(mail.to).toBe('bob@example.com');
    expect(mail.html).toContain(`/login/${USERS.bob.token}`);
  });

  it("n'envoie rien à un membre déjà actif", async () => {
    await env.DB.prepare("UPDATE users SET email = 'bob@example.com' WHERE id = ?").bind(USERS.bob.id).run();
    expect(await requestCapturingEmails(`/api/admin/users/${USERS.bob.id}/restore`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${USERS.admin.token}` },
    })).toEqual([]);
  });
});
