import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import app from '../src/app';
import { seedDatabase, USERS } from './fixtures';

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
