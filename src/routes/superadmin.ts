import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireSuperadmin } from '../middleware/auth';
import { apiError, readJsonObject } from '../http/errors';
import { ADMIN_ROLES, SUPERADMIN_ROLES, canManageLink, outranks } from '../domain/roles';
import { ORGANIZATION_NAME_MAX_LENGTH, normalizeName, normalizeOptionalEmail } from '../domain/validation';
import { emailTaken, findCompanyMember, newUserCredentials, sqlPlaceholders } from '../services/users';
import { sendMagicLinkEmail } from '../services/email';
import { magicLinkUrl } from '../services/links';
import { generateInviteCode } from '../services/invites';

const PROMOTABLE_ROLES = new Set(['admin', 'superadmin']);

export const superadminRoutes = new Hono<AppEnv>().use('*', requireSuperadmin);

const normalizeTeamName = (raw: unknown) => normalizeName(raw, { max: ORGANIZATION_NAME_MAX_LENGTH });

superadminRoutes.get('/teams', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT t.id, t.name, t.active, t.created_at,
      (SELECT COUNT(*) FROM users WHERE team_id = t.id AND active = 1) AS member_count,
      (SELECT GROUP_CONCAT(u.name, ', ') FROM users u
         WHERE u.team_id = t.id AND u.active = 1 AND u.role IN (${sqlPlaceholders(ADMIN_ROLES)})) AS admins
    FROM teams t WHERE t.company_id = ?
    ORDER BY t.active DESC, t.name ASC
  `).bind(...ADMIN_ROLES, c.get('user').company_id).all();
  return c.json(results);
});

superadminRoutes.post('/teams', async (c) => {
  const name = normalizeTeamName((await readJsonObject(c)).name);
  if (!name) return apiError(c, 'TEAM_NAME_INVALID');
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO teams (id, company_id, name, active, invite_code) VALUES (?, ?, ?, 1, ?)')
    .bind(id, c.get('user').company_id, name, generateInviteCode()).run();
  return c.json({ success: true, id });
});

superadminRoutes.patch('/teams/:id', async (c) => {
  const name = normalizeTeamName((await readJsonObject(c)).name);
  if (!name) return apiError(c, 'TEAM_NAME_INVALID');
  const result = await c.env.DB.prepare('UPDATE teams SET name = ? WHERE id = ? AND company_id = ?')
    .bind(name, c.req.param('id'), c.get('user').company_id).run();
  if (result.meta.changes === 0) return apiError(c, 'TEAM_NOT_FOUND');
  return c.json({ success: true });
});

superadminRoutes.delete('/teams/:id', async (c) => {
  const superadmin = c.get('user');
  const teamId = c.req.param('id');
  if (teamId === superadmin.team_id) return apiError(c, 'OWN_TEAM');
  const result = await c.env.DB.prepare('UPDATE teams SET active = 0 WHERE id = ? AND company_id = ?').bind(teamId, superadmin.company_id).run();
  if (result.meta.changes === 0) return apiError(c, 'TEAM_NOT_FOUND');
  return c.json({ success: true });
});

superadminRoutes.patch('/teams/:id/restore', async (c) => {
  const result = await c.env.DB.prepare('UPDATE teams SET active = 1 WHERE id = ? AND company_id = ?')
    .bind(c.req.param('id'), c.get('user').company_id).run();
  if (result.meta.changes === 0) return apiError(c, 'TEAM_NOT_FOUND');
  return c.json({ success: true });
});

superadminRoutes.post('/teams/:id/users', async (c) => {
  const superadmin = c.get('user');
  const body = await readJsonObject(c);
  const name = normalizeName(body.name);
  if (!name) return apiError(c, 'NAME_INVALID');
  const role = typeof body.role === 'string' && PROMOTABLE_ROLES.has(body.role) ? body.role : 'member';
  const email = normalizeOptionalEmail(body.email);

  const team = await c.env.DB.prepare('SELECT id, name FROM teams WHERE id = ? AND company_id = ?')
    .bind(c.req.param('id'), superadmin.company_id).first<{ id: string; name: string }>();
  if (!team) return apiError(c, 'TEAM_NOT_FOUND');
  if (email && await emailTaken(c.env.DB, email)) return apiError(c, 'EMAIL_TAKEN');

  const member = newUserCredentials();
  await c.env.DB.prepare('INSERT INTO users (id, team_id, name, role, active, token, email) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(member.id, team.id, name, role, member.token, email).run();
  if (email) sendMagicLinkEmail(c, { email, name, teamName: team.name, locale: superadmin.locale, token: member.token });
  return c.json({ success: true, id: member.id, login_url: magicLinkUrl(c, member.token) });
});

superadminRoutes.get('/admins', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.team_id, t.name AS team_name
    FROM users u JOIN teams t ON t.id = u.team_id
    WHERE t.company_id = ? AND u.role IN (${sqlPlaceholders(ADMIN_ROLES)})
    ORDER BY t.name ASC, u.name ASC
  `).bind(c.get('user').company_id, ...ADMIN_ROLES).all();
  return c.json(results);
});

superadminRoutes.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.team_id, t.name AS team_name
    FROM users u JOIN teams t ON t.id = u.team_id
    WHERE t.company_id = ? ORDER BY t.name ASC, u.active DESC, u.name ASC
  `).bind(c.get('user').company_id).all();
  return c.json(results);
});

superadminRoutes.post('/users/:id/magic-link', async (c) => {
  const superadmin = c.get('user');
  const target = await findCompanyMember(c.env.DB, c.req.param('id'), superadmin.company_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_COMPANY');
  if (!canManageLink(superadmin, target)) return apiError(c, 'ROLE_TOO_HIGH');
  return c.json({ url: magicLinkUrl(c, target.token) });
});

superadminRoutes.post('/users/:id/promote', async (c) => {
  const superadmin = c.get('user');
  const { role } = await readJsonObject(c);
  if (typeof role !== 'string' || !PROMOTABLE_ROLES.has(role)) return apiError(c, 'ROLE_INVALID');
  const target = await findCompanyMember(c.env.DB, c.req.param('id'), superadmin.company_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_COMPANY');
  if (!outranks(superadmin.role, target.role)) return apiError(c, 'ROLE_TOO_HIGH');
  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, target.id).run();
  return c.json({ success: true });
});

superadminRoutes.post('/users/:id/demote', async (c) => {
  const superadmin = c.get('user');
  const target = await findCompanyMember(c.env.DB, c.req.param('id'), superadmin.company_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_COMPANY');
  if (target.role === 'owner') return apiError(c, 'OWNER_UNTOUCHABLE');

  if (target.role === 'superadmin') {
    const remaining = await c.env.DB.prepare(`
      SELECT COUNT(*) as n FROM users u JOIN teams t ON t.id = u.team_id
      WHERE t.company_id = ? AND u.role IN (${sqlPlaceholders(SUPERADMIN_ROLES)}) AND u.active = 1 AND u.id != ?
    `).bind(superadmin.company_id, ...SUPERADMIN_ROLES, target.id).first<{ n: number }>();
    if (!remaining?.n) return apiError(c, 'LAST_SUPERADMIN');
  }

  await c.env.DB.prepare("UPDATE users SET role = 'member' WHERE id = ?").bind(target.id).run();
  return c.json({ success: true });
});
