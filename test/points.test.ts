import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { api, seedDatabase, USERS, CATEGORY_HELP, CATEGORY_GLOBEX, TEAM_ACME_DEV } from './fixtures';

beforeEach(seedDatabase);

const givePoint = (from: typeof USERS.alice, to: typeof USERS.alice, category = CATEGORY_HELP) =>
  api('/api/points', { as: from, method: 'POST', body: { to_user_id: to.id, category_id: category } });

describe('don de points', () => {
  it('accepte un point entre coéquipiers', async () => {
    const response = await givePoint(USERS.alice, USERS.bob);
    expect(response.status).toBe(200);
  });

  it("refuse de s'attribuer un point", async () => {
    const response = await givePoint(USERS.alice, USERS.alice);
    expect(response.status).toBe(400);
  });

  it("refuse un point vers une autre équipe", async () => {
    const response = await givePoint(USERS.alice, USERS.opsMember);
    expect(response.status).toBe(403);
  });

  it("refuse un badge d'une autre équipe", async () => {
    const response = await givePoint(USERS.alice, USERS.bob, CATEGORY_GLOBEX);
    expect(response.status).not.toBe(200);
  });

  it('bloque le doublon même badge / même destinataire sous 5 minutes', async () => {
    await givePoint(USERS.alice, USERS.bob);
    const response = await givePoint(USERS.alice, USERS.bob);
    expect(response.status).toBe(429);
  });

  it("permet d'annuler son dernier point", async () => {
    await givePoint(USERS.alice, USERS.bob);
    const response = await api('/api/points/undo', { as: USERS.alice, method: 'POST' });
    expect(response.status).toBe(200);
  });
});

async function logPoints(from: typeof USERS.alice, to: typeof USERS.alice, count: number, createdAt = "datetime('now')") {
  const statements = Array.from({ length: count }, () =>
    env.DB.prepare(`INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, created_at) VALUES (?, ?, ?, ?, ${createdAt})`)
      .bind(from.teamId, from.id, to.id, CATEGORY_HELP));
  await env.DB.batch(statements);
}

const OTHER_CATEGORY = 'category-other';

describe('limites de dons', () => {
  beforeEach(async () => {
    await env.DB.prepare("INSERT INTO categories (id, team_id, name, emoji) VALUES (?, ?, 'Autre', '⭐')")
      .bind(OTHER_CATEGORY, TEAM_ACME_DEV).run();
  });

  it('refuse le 11e point de la journée', async () => {
    await logPoints(USERS.alice, USERS.admin, 10, "datetime('now', '-1 hour')");
    const response = await givePoint(USERS.alice, USERS.bob, OTHER_CATEGORY);
    expect(response.status).toBe(429);
    expect((await response.json() as { error: string }).error).toContain('10 points');
  });

  it('refuse un 4e point au même collègue dans la journée', async () => {
    await logPoints(USERS.alice, USERS.bob, 3, "datetime('now', '-1 hour')");
    const response = await givePoint(USERS.alice, USERS.bob, OTHER_CATEGORY);
    expect(response.status).toBe(429);
    expect((await response.json() as { error: string }).error).toContain('bob');
  });

  it('gèle un spammeur signalé', async () => {
    await logPoints(USERS.alice, USERS.admin, 9, "datetime('now', '-2 days')");
    const response = await givePoint(USERS.alice, USERS.bob, OTHER_CATEGORY);
    expect(response.status).toBe(429);
    expect((await response.json() as { error: string }).error).toContain('régales');
  });
});

describe('gages', () => {
  beforeEach(async () => {
    await env.DB.prepare("INSERT INTO dare_rules (id, team_id, category_id, threshold, dare_text) VALUES ('rule-1', ?, ?, 3, 'croissants')")
      .bind(TEAM_ACME_DEV, CATEGORY_HELP).run();
  });

  it('prévient à un point du seuil', async () => {
    await logPoints(USERS.admin, USERS.bob, 1, "datetime('now', '-1 day')");
    expect(await (await givePoint(USERS.alice, USERS.bob)).json()).toMatchObject({ gageWarning: { name: 'bob' }, gageTriggered: null });
  });

  it('déclenche le gage au seuil', async () => {
    await logPoints(USERS.admin, USERS.bob, 2, "datetime('now', '-1 day')");
    expect(await (await givePoint(USERS.alice, USERS.bob)).json()).toMatchObject({ gageTriggered: { name: 'bob', dare: 'croissants' } });
  });

  it("affiche le gage actif dans le classement de l'équipe", async () => {
    await logPoints(USERS.admin, USERS.bob, 3, "datetime('now', '-1 day')");
    const board = await (await api('/api/users-stats', { as: USERS.alice })).json() as { name: string; gage: string | null; rank: number }[];
    expect(board[0]).toMatchObject({ name: 'bob', gage: 'croissants', rank: 1 });
  });
});

describe('mot accompagnant un point', () => {
  it("peut être ajouté par le donneur juste après le don", async () => {
    const { pointId } = await (await givePoint(USERS.alice, USERS.bob)).json() as { pointId: number };
    const response = await api(`/api/points/${pointId}/reason`, { as: USERS.alice, method: 'PATCH', body: { reason: '  Merci pour la relecture ' } });
    expect(response.status).toBe(200);
    const row = await env.DB.prepare('SELECT reason FROM points_log WHERE id = ?').bind(pointId).first<{ reason: string }>();
    expect(row?.reason).toBe('Merci pour la relecture');
  });

  it("ne peut pas être ajouté par quelqu'un d'autre", async () => {
    const { pointId } = await (await givePoint(USERS.alice, USERS.bob)).json() as { pointId: number };
    const response = await api(`/api/points/${pointId}/reason`, { as: USERS.bob, method: 'PATCH', body: { reason: 'pirate' } });
    expect((await response.json() as { code: string }).code).toBe('REASON_EDIT_EXPIRED');
  });

  it('ne peut plus être ajouté après 5 minutes', async () => {
    await logPoints(USERS.alice, USERS.bob, 1, "datetime('now', '-10 minutes')");
    const old = await env.DB.prepare('SELECT id FROM points_log ORDER BY id DESC LIMIT 1').first<{ id: number }>();
    const response = await api(`/api/points/${old?.id}/reason`, { as: USERS.alice, method: 'PATCH', body: { reason: 'trop tard' } });
    expect(response.status).toBe(403);
  });

  it('refuse un mot vide', async () => {
    const { pointId } = await (await givePoint(USERS.alice, USERS.bob)).json() as { pointId: number };
    const response = await api(`/api/points/${pointId}/reason`, { as: USERS.alice, method: 'PATCH', body: { reason: '   ' } });
    expect(response.status).toBe(400);
  });
});
