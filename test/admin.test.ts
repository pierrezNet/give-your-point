import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { api, seedDatabase, USERS, CATEGORY_HELP, TEAM_ACME_DEV } from './fixtures';
import { teamActivityFingerprint } from '../src/services/teamStats';

beforeEach(seedDatabase);

const json = async (response: Response) => response.json() as Promise<any>;

describe("format des erreurs de l'API", () => {
  it('renvoie un code stable en plus du message', async () => {
    const response = await api('/api/points', { as: USERS.alice, method: 'POST', body: { to_user_id: USERS.alice.id, category_id: CATEGORY_HELP } });
    expect(await json(response)).toMatchObject({ code: 'SELF_POINT', error: expect.stringContaining('toi-même') });
  });

  it("n'ajoute pas de paramètres quand le message n'en a pas", async () => {
    const response = await api('/api/admin/users', { as: USERS.alice });
    expect(await json(response)).toEqual({ code: 'ADMIN_REQUIRED', error: 'Accès admin requis' });
  });

  it("répond 400 INVALID_REQUEST à un corps qui n'est pas du JSON", async () => {
    const response = await api('/api/points', { as: USERS.alice, method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(response.status).toBe(400);
    expect((await json(response)).code).toBe('INVALID_REQUEST');
  });
});

describe('badges', () => {
  const createBadge = (body: unknown) => api('/api/admin/categories', { as: USERS.admin, method: 'POST', body });

  it('crée un badge valide', async () => {
    expect((await createBadge({ name: 'Ponctualité', emoji: '⏰' })).status).toBe(200);
  });

  it.each([{ name: 'Sans emoji' }, { emoji: '⏰' }, { name: 'x'.repeat(41), emoji: '⏰' }, { name: 42, emoji: '⏰' }])('refuse %j', async (body) => {
    expect((await json(await createBadge(body))).code).toBe('BADGE_INVALID');
  });
});

describe('règles de gages', () => {
  const createRule = (body: Record<string, unknown>) =>
    api('/api/admin/rules', { as: USERS.admin, method: 'POST', body: { category_id: CATEGORY_HELP, ...body } });

  it('accepte un seuil saisi sous forme de texte (champ de formulaire)', async () => {
    expect((await createRule({ threshold: '3', dare_text: 'croissants' })).status).toBe(200);
    const rule = await env.DB.prepare('SELECT threshold FROM dare_rules').first<{ threshold: number }>();
    expect(rule?.threshold).toBe(3);
  });

  it.each([
    { threshold: 0, dare_text: 'croissants' },
    { threshold: 2.5, dare_text: 'croissants' },
    { threshold: 'abc', dare_text: 'croissants' },
    { threshold: 3, dare_text: '' },
    { threshold: 3, dare_text: 'x'.repeat(141) },
  ])('refuse %j', async (body) => {
    expect((await json(await createRule(body))).code).toBe('RULE_INVALID');
  });

  it("refuse un badge d'une autre équipe", async () => {
    const response = await createRule({ category_id: 'category-globex', threshold: 3, dare_text: 'croissants' });
    expect((await json(response)).code).toBe('CATEGORY_NOT_IN_TEAM');
  });
});

describe("lien d'invitation", () => {
  it("est fourni à l'admin sur /api/admin/invite-link", async () => {
    const body = await json(await api('/api/admin/invite-link', { as: USERS.admin }));
    expect(body).toMatchObject({ code: 'invite-acme-dev', url: 'https://donnetonpoint.fr/join/invite-acme-dev' });
  });

  it('est refusé à un membre', async () => {
    expect((await api('/api/admin/invite-link', { as: USERS.alice })).status).toBe(403);
  });
});

describe("remise à zéro d'un gage", () => {
  const insertPoint = (createdAt: string) => env.DB.prepare(
    `INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, created_at) VALUES (?, ?, ?, ?, datetime('now', '${createdAt}'))`,
  ).bind(TEAM_ACME_DEV, USERS.alice.id, USERS.bob.id, CATEGORY_HELP);
  const clear = () => api(`/api/admin/clear-category/${USERS.bob.id}/${CATEGORY_HELP}`, { as: USERS.admin, method: 'POST' });

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO dare_rules (id, team_id, category_id, threshold, dare_text) VALUES ('rule', ?, ?, 2, 'croissants'), ('rule-big', ?, ?, 3, 'pizza')")
        .bind(TEAM_ACME_DEV, CATEGORY_HELP, TEAM_ACME_DEV, CATEGORY_HELP),
      insertPoint('-2 minutes'),
      insertPoint('-1 minutes'),
    ]);
  });

  it("consigne le gage acquitté sans effacer l'historique des points", async () => {
    expect((await clear()).status).toBe(200);
    const [log, points] = await Promise.all([
      env.DB.prepare('SELECT user_id, dare_text FROM dare_log').first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM points_log').first<{ n: number }>(),
    ]);
    expect(log).toEqual({ user_id: USERS.bob.id, dare_text: 'croissants' });
    expect(points?.n).toBe(2);
  });

  it('remet le compteur du gage à zéro, puis compte les points reçus ensuite', async () => {
    await clear();
    expect(await json(await api('/api/admin/dares', { as: USERS.admin }))).toEqual([]);
    await env.DB.prepare("UPDATE dare_log SET cleared_at = datetime('now', '-30 seconds')").run();
    await env.DB.batch([insertPoint('-10 seconds'), insertPoint('-5 seconds')]);
    expect(await json(await api('/api/admin/dares', { as: USERS.admin }))).toEqual([
      { userId: USERS.bob.id, categoryId: CATEGORY_HELP, count: 2, dare: 'croissants' },
    ]);
  });

  it('consigne la règle la plus haute atteinte', async () => {
    await env.DB.batch([insertPoint('-30 seconds')]);
    await clear();
    expect((await env.DB.prepare('SELECT dare_text FROM dare_log').first())?.dare_text).toBe('pizza');
  });

  it("refuse quand aucun gage n'est en cours", async () => {
    await clear();
    expect((await json(await clear())).code).toBe('NO_ACTIVE_DARE');
  });

  it("refuse un membre d'une autre équipe", async () => {
    const response = await api(`/api/admin/clear-category/${USERS.opsMember.id}/${CATEGORY_HELP}`, { as: USERS.admin, method: 'POST' });
    expect(response.status).toBe(403);
  });
});

describe('statistiques par période', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now', '-1 day'))")
        .bind(TEAM_ACME_DEV, USERS.alice.id, USERS.bob.id, CATEGORY_HELP),
      env.DB.prepare("INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now', '-20 days'))")
        .bind(TEAM_ACME_DEV, USERS.alice.id, USERS.bob.id, CATEGORY_HELP),
      env.DB.prepare("INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, created_at) VALUES (?1, ?2, ?3, ?4, datetime('now', '-400 days'))")
        .bind(TEAM_ACME_DEV, USERS.bob.id, USERS.alice.id, CATEGORY_HELP),
    ]);
  });

  it.each([['7', 1], ['30', 2], ['all', 3], ['nimporte', 2]])('période %s → %i point(s)', async (period, total) => {
    const stats = await json(await api(`/api/stats?period=${period}`, { as: USERS.alice }));
    expect(stats.totalPoints).toBe(total);
  });

  it("situe l'utilisateur dans les classements", async () => {
    const stats = await json(await api('/api/stats?period=all', { as: USERS.alice }));
    expect(stats.me).toEqual({ given: 2, received: 1, rankGiver: 1, rankReceiver: 2, gages: 0 });
  });
});

describe("empreinte d'activité du flux temps réel", () => {
  it('change quand un point est donné, et seulement alors', async () => {
    const before = await teamActivityFingerprint(env.DB, TEAM_ACME_DEV);
    expect(await teamActivityFingerprint(env.DB, TEAM_ACME_DEV)).toBe(before);
    await api('/api/points', { as: USERS.alice, method: 'POST', body: { to_user_id: USERS.bob.id, category_id: CATEGORY_HELP } });
    expect(await teamActivityFingerprint(env.DB, TEAM_ACME_DEV)).not.toBe(before);
  });
});
