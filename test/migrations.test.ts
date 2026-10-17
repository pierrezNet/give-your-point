import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { seedDatabase, TEAM_ACME_DEV, CATEGORY_HELP } from './fixtures';

const LEGACY_ALICE = 'legacy-alice';
const LEGACY_BOB = 'legacy-bob';

async function seedLegacyUsers() {
  const db = env.DB;
  await db.batch([
    db.prepare("INSERT INTO users (id, token, team_id, name, role) VALUES (?, ?, ?, 'legacy alice', 'member'), (?, ?, ?, 'legacy bob', 'member')")
      .bind(LEGACY_ALICE, LEGACY_ALICE, TEAM_ACME_DEV, LEGACY_BOB, LEGACY_BOB, TEAM_ACME_DEV),
    db.prepare('INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id) VALUES (?, ?, ?, ?)')
      .bind(TEAM_ACME_DEV, LEGACY_ALICE, LEGACY_BOB, CATEGORY_HELP),
    db.prepare('INSERT INTO dare_log (team_id, user_id, dare_text) VALUES (?, ?, ?)').bind(TEAM_ACME_DEV, LEGACY_BOB, 'croissants'),
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, 'https://fcm.googleapis.com/x', 'p', 'a')").bind(LEGACY_BOB),
  ]);
}

async function runSplitTokenMigration() {
  await env.DB.batch(env.SPLIT_TOKEN_MIGRATION.map((query) => env.DB.prepare(query)));
}

const userByToken = (token: string) =>
  env.DB.prepare('SELECT id, token FROM users WHERE token = ?').bind(token).first<{ id: string; token: string }>();

beforeEach(async () => {
  await seedDatabase();
  await seedLegacyUsers();
});

describe('migration 2026-14 : séparation id / jeton', () => {
  it('donne un nouvel id UUID v4 en conservant le jeton', async () => {
    await runSplitTokenMigration();
    const alice = await userByToken(LEGACY_ALICE);
    expect(alice?.id).not.toBe(LEGACY_ALICE);
    expect(alice?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('reporte le nouvel id sur les points, les gages et les abonnements push', async () => {
    await runSplitTokenMigration();
    const alice = await userByToken(LEGACY_ALICE);
    const bob = await userByToken(LEGACY_BOB);
    const point = await env.DB.prepare('SELECT from_user_id, to_user_id FROM points_log').first();
    const dare = await env.DB.prepare('SELECT user_id FROM dare_log').first();
    const subscription = await env.DB.prepare('SELECT user_id FROM push_subscriptions').first();
    expect(point).toEqual({ from_user_id: alice?.id, to_user_id: bob?.id });
    expect(dare).toEqual({ user_id: bob?.id });
    expect(subscription).toEqual({ user_id: bob?.id });
  });

  it('ne touche pas aux utilisateurs dont le jeton est déjà distinct', async () => {
    await runSplitTokenMigration();
    expect(await userByToken('token-alice')).toEqual({ id: 'user-alice', token: 'token-alice' });
  });

  it('est sans effet si on la rejoue', async () => {
    await runSplitTokenMigration();
    const firstId = (await userByToken(LEGACY_ALICE))?.id;
    await runSplitTokenMigration();
    expect((await userByToken(LEGACY_ALICE))?.id).toBe(firstId);
  });
});
