import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import app from '../src/app';
import { acceptTurnstile } from './fixtures';
import type { ForumFeedback } from '../src/domain/feedback';
import type { ForumFeedbackResult } from '../src/env';

afterEach(() => vi.restoreAllMocks());

const VALID = { type: 'bug', message: 'Le classement ne se met pas à jour', pseudo: ' Ann ', contact: 'ann@example.com', lang: 'en', turnstile_token: 'ok' };

function sendFeedback(body: unknown, forum?: { submit(feedback: ForumFeedback): Promise<ForumFeedbackResult> }) {
  return app.request('https://donnetonpoint.test/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { ...env, FORUM: forum }, createExecutionContext());
}

const json = async (response: Response) => response.json() as Promise<any>;

describe("retour « J'ai un retour »", () => {
  it('transmet au forum le retour validé, avec le libellé du type', async () => {
    acceptTurnstile();
    const submit = vi.fn(async () => ({ ok: true as const, topicId: 12 }));
    const response = await sendFeedback(VALID, { submit });
    expect(response.status).toBe(200);
    expect(submit).toHaveBeenCalledWith({ type: 'Bug', message: VALID.message, pseudo: 'Ann', contact: 'ann@example.com', lang: 'en' });
  });

  it("refuse un retour invalide sans solliciter l'anti-bot ni le forum", async () => {
    const submit = vi.fn();
    const response = await sendFeedback({ ...VALID, type: 'inconnu' }, { submit });
    expect((await json(response)).code).toBe('FEEDBACK_INVALID');
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuse sans vérification anti-bot réussie", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: false }));
    const submit = vi.fn();
    expect((await json(await sendFeedback(VALID, { submit }))).code).toBe('TURNSTILE_FAILED');
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ['sans liaison avec le forum', undefined],
    ['quand le forum refuse', { submit: async () => ({ ok: false as const, reason: 'disabled' }) }],
    ['quand le forum est injoignable', { submit: async () => { throw new Error('down'); } }],
  ])('répond FEEDBACK_UNAVAILABLE %s', async (_case, forum) => {
    acceptTurnstile();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await sendFeedback(VALID, forum);
    expect(response.status).toBe(503);
    expect((await json(response)).code).toBe('FEEDBACK_UNAVAILABLE');
  });
});
