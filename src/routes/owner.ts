import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireOwner } from '../middleware/auth';
import { apiError, readJsonObject } from '../http/errors';
import { ADMIN_ROLES } from '../domain/roles';
import { sqlPlaceholders } from '../services/users';

const FUNNEL_EVENTS = ['landing_vue', 'onboarding_soumis', 'join_vue', 'join_soumis'] as const;

export const ownerRoutes = new Hono<AppEnv>().use('*', requireOwner);

ownerRoutes.get('/companies', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT c.id, c.name, c.active, c.created_at,
      (SELECT COUNT(*) FROM teams WHERE company_id = c.id AND active = 1) AS team_count,
      (SELECT COUNT(*) FROM users u JOIN teams t ON t.id = u.team_id WHERE t.company_id = c.id AND u.active = 1) AS member_count,
      (SELECT GROUP_CONCAT(u.name, ', ') FROM users u JOIN teams t ON t.id = u.team_id
         WHERE t.company_id = c.id AND u.active = 1 AND u.role IN (${sqlPlaceholders(ADMIN_ROLES)})) AS admins,
      (SELECT COUNT(*) FROM points_log p JOIN teams t ON t.id = p.team_id WHERE t.company_id = c.id) AS total_points,
      (SELECT MAX(p.created_at) FROM points_log p JOIN teams t ON t.id = p.team_id WHERE t.company_id = c.id) AS last_point_at,
      (SELECT COUNT(*) FROM points_log p JOIN teams t ON t.id = p.team_id
         WHERE t.company_id = c.id AND p.created_at >= datetime('now', '-7 days')) AS points_last_7d
    FROM companies c
    ORDER BY c.created_at DESC
  `).bind(...ADMIN_ROLES).all();
  return c.json(results);
});

ownerRoutes.patch('/companies/:id/active', async (c) => {
  const companyId = c.req.param('id');
  if (companyId === c.get('user').company_id) return apiError(c, 'OWN_COMPANY');
  const active = (await readJsonObject(c)).active ? 1 : 0;
  const result = await c.env.DB.prepare('UPDATE companies SET active = ? WHERE id = ?').bind(active, companyId).run();
  if (result.meta.changes === 0) return apiError(c, 'COMPANY_NOT_FOUND');
  return c.json({ success: true });
});

ownerRoutes.delete('/companies/:id', async (c) => {
  const companyId = c.req.param('id');
  if (companyId === c.get('user').company_id) return apiError(c, 'OWN_COMPANY');
  const db = c.env.DB;
  const company = await db.prepare('SELECT active FROM companies WHERE id = ?').bind(companyId).first<{ active: number }>();
  if (!company) return apiError(c, 'COMPANY_NOT_FOUND');
  if (company.active === 1) return apiError(c, 'COMPANY_STILL_ACTIVE');

  const teamsOfCompany = 'SELECT id FROM teams WHERE company_id = ?';
  await db.batch([
    db.prepare(`DELETE FROM push_subscriptions WHERE user_id IN (SELECT id FROM users WHERE team_id IN (${teamsOfCompany}))`).bind(companyId),
    ...['dare_log', 'points_log', 'dare_rules', 'categories', 'users'].map((table) =>
      db.prepare(`DELETE FROM ${table} WHERE team_id IN (${teamsOfCompany})`).bind(companyId)),
    db.prepare('DELETE FROM teams WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM companies WHERE id = ?').bind(companyId),
  ]);
  return c.json({ success: true });
});

ownerRoutes.get('/funnel', async (c) => {
  const [events, created, activated] = await Promise.all([
    c.env.DB.prepare("SELECT name, COUNT(*) as total FROM analytics_events WHERE created_at >= datetime('now', '-30 days') GROUP BY name")
      .all<{ name: string; total: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as n FROM companies WHERE created_at >= datetime('now', '-30 days')").first<{ n: number }>(),
    c.env.DB.prepare(`
      SELECT COUNT(DISTINCT t.company_id) as n
      FROM teams t JOIN companies co ON co.id = t.company_id JOIN points_log p ON p.team_id = t.id
      WHERE co.created_at >= datetime('now', '-30 days')
    `).first<{ n: number }>(),
  ]);
  const totals = new Map((events.results ?? []).map((row) => [row.name, row.total]));
  return c.json({
    ...Object.fromEntries(FUNNEL_EVENTS.map((event) => [event, totals.get(event) ?? 0])),
    espaces_crees_30j: created?.n ?? 0,
    espaces_actives_30j: activated?.n ?? 0,
  });
});
