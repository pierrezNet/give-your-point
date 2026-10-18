import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { acceptTurnstile, api, seedDatabase, USERS } from './fixtures';
import { DEFAULT_DARE_THRESHOLD } from '../src/domain/defaultCategories';

beforeEach(seedDatabase);
afterEach(() => vi.restoreAllMocks());

const json = async (response: Response) => response.json() as Promise<any>;
const join = (body: Record<string, unknown>) =>
  api('/api/join', { method: 'POST', body: { code: 'invite-acme-dev', name: 'erin', turnstile_token: 'ok', ...body } });
const erin = () => env.DB.prepare("SELECT email, locale, active FROM users WHERE name = 'erin'").first();

describe('auto-inscription par lien', () => {
  beforeEach(() => { acceptTurnstile(); });

  it("enregistre l'e-mail facultatif et la langue de l'inscrit, en attente", async () => {
    expect((await join({ email: ' erin@example.com ', locale: 'en' })).status).toBe(200);
    expect(await erin()).toEqual({ email: 'erin@example.com', locale: 'en', active: 0 });
  });

  it("accepte l'inscription sans e-mail", async () => {
    expect((await join({ email: '' })).status).toBe(200);
    expect(await erin()).toMatchObject({ email: null, active: 0 });
  });

  it('refuse un e-mail invalide', async () => {
    expect((await json(await join({ email: 'pas-un-email' }))).code).toBe('EMAIL_INVALID');
  });

  it('refuse un e-mail déjà utilisé', async () => {
    await env.DB.prepare("UPDATE users SET email = 'erin@example.com' WHERE id = ?").bind(USERS.bob.id).run();
    expect((await json(await join({ email: 'erin@example.com' }))).code).toBe('EMAIL_TAKEN');
  });
});

describe("création d'un espace", () => {
  it('crée une règle de gage par défaut pour chaque badge', async () => {
    acceptTurnstile();
    await api('/api/onboarding', { method: 'POST', body: { company_name: 'Initech', admin_name: 'frank', turnstile_token: 'ok' } });
    const { results } = await env.DB.prepare(`
      SELECT c.name, r.threshold, r.dare_text FROM categories c JOIN users u ON u.team_id = c.team_id
      LEFT JOIN dare_rules r ON r.category_id = c.id WHERE u.name = 'frank'
    `).all<{ name: string; threshold: number; dare_text: string }>();
    expect(results.length).toBe(7);
    expect(results.every((row) => row.threshold === DEFAULT_DARE_THRESHOLD && row.dare_text)).toBe(true);
  });
});
