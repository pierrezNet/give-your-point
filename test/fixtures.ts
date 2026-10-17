import { vi } from 'vitest';
import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import app from '../src/app';

export const COMPANY_ACME = 'company-acme';
export const COMPANY_GLOBEX = 'company-globex';
export const TEAM_ACME_DEV = 'team-acme-dev';
export const TEAM_ACME_OPS = 'team-acme-ops';
export const TEAM_GLOBEX = 'team-globex';
export const CATEGORY_HELP = 'category-help';
export const CATEGORY_GLOBEX = 'category-globex';

export interface FixtureUser {
  id: string;
  token: string;
  teamId: string;
  name: string;
  role: 'member' | 'admin' | 'superadmin' | 'owner';
}

const user = (key: string, teamId: string, role: FixtureUser['role']): FixtureUser => ({
  id: `user-${key}`,
  token: `token-${key}`,
  teamId,
  name: key,
  role,
});

export const USERS = {
  owner: user('owner', TEAM_ACME_DEV, 'owner'),
  superadmin: user('superadmin', TEAM_ACME_DEV, 'superadmin'),
  admin: user('admin', TEAM_ACME_DEV, 'admin'),
  alice: user('alice', TEAM_ACME_DEV, 'member'),
  bob: user('bob', TEAM_ACME_DEV, 'member'),
  opsMember: user('ops', TEAM_ACME_OPS, 'member'),
  globexAdmin: user('globex-admin', TEAM_GLOBEX, 'admin'),
} satisfies Record<string, FixtureUser>;

const TABLES = [
  'companies', 'teams', 'users', 'categories', 'points_log',
  'dare_rules', 'dare_log', 'push_subscriptions', 'analytics_events',
];

export async function seedDatabase(): Promise<void> {
  const db = env.DB;
  await db.batch([
    ...TABLES.map((table) => db.prepare(`DELETE FROM ${table}`)),
    db.prepare('INSERT INTO companies (id, name) VALUES (?, ?), (?, ?)')
      .bind(COMPANY_ACME, 'Acme', COMPANY_GLOBEX, 'Globex'),
    db.prepare('INSERT INTO teams (id, company_id, name, invite_code) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)')
      .bind(
        TEAM_ACME_DEV, COMPANY_ACME, 'Dev', 'invite-acme-dev',
        TEAM_ACME_OPS, COMPANY_ACME, 'Ops', 'invite-acme-ops',
        TEAM_GLOBEX, COMPANY_GLOBEX, 'Globex', 'invite-globex',
      ),
    db.prepare('INSERT INTO categories (id, team_id, name, emoji) VALUES (?, ?, ?, ?), (?, ?, ?, ?)')
      .bind(CATEGORY_HELP, TEAM_ACME_DEV, 'Entraide', '🤝', CATEGORY_GLOBEX, TEAM_GLOBEX, 'Globex', '🌐'),
    ...Object.values(USERS).map((u) =>
      db.prepare('INSERT INTO users (id, token, team_id, name, role) VALUES (?, ?, ?, ?, ?)')
        .bind(u.id, u.token, u.teamId, u.name, u.role),
    ),
  ]);
}

interface ApiOptions {
  as?: FixtureUser;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function api(path: string, { as, method = 'GET', body, headers: extraHeaders = {} }: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (as) headers.Authorization = `Bearer ${as.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return app.request(
    `https://donnetonpoint.test${path}`,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
    createExecutionContext(),
  );
}

export async function findUser(id: string) {
  return env.DB.prepare('SELECT id, token, role, active FROM users WHERE id = ?')
    .bind(id).first<{ id: string; token: string; role: string; active: number }>();
}

export async function findUserByName(name: string) {
  return env.DB.prepare('SELECT id, token, role, active FROM users WHERE name = ?')
    .bind(name).first<{ id: string; token: string; role: string; active: number }>();
}

export function acceptTurnstile() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('challenges.cloudflare.com/turnstile')) {
      return Response.json({ success: true, hostname: 'donnetonpoint.test' });
    }
    return new Response(null, { status: 204 });
  });
}
