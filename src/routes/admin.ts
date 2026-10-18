import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../env';
import { requireAdmin } from '../middleware/auth';
import { apiError, readJsonObject } from '../http/errors';
import { canManageLink, outranks } from '../domain/roles';
import { normalizeDareText, normalizeEmoji, normalizeName, normalizeOptionalEmail, normalizeThreshold } from '../domain/validation';
import { highestReachedRule, listActiveDares, membersReachedByRuleChange, type DareRule } from '../domain/dares';
import { spamWatchlist } from '../domain/spam';
import { buildInviteEmail } from '../email/templates';
import { emailTaken, findTeamMember, newUserCredentials } from '../services/users';
import { sendInBackground, sendMagicLinkEmail } from '../services/email';
import { joinUrl, magicLinkUrl } from '../services/links';
import { generateInviteCode, getOrCreateInviteCode } from '../services/invites';
import { computeSpammers, countPointsTowardsDare, fetchDareRules, fetchPointTotals } from '../services/teamStats';
import { announceDare, type DareMember } from '../services/dares';

const POINTS_LOG_LIMIT = 50;
const DARE_LOG_LIMIT = 50;
const SPAMMER_PARDON_TEXT = "🚨 Spammeur — a régalé l'équipe ☕";

export const adminRoutes = new Hono<AppEnv>().use('*', requireAdmin);

const teamOf = (c: AppContext) => c.get('user').team_id;

async function setMemberActive(c: AppContext, active: 0 | 1) {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id') ?? '', admin.team_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_TEAM');
  if (target.id === admin.id) return apiError(c, 'OWN_STATUS');
  if (!outranks(admin.role, target.role)) return apiError(c, 'ROLE_TOO_HIGH');
  await c.env.DB.prepare('UPDATE users SET active = ? WHERE id = ?').bind(active, target.id).run();
  if (active === 1 && target.active !== 1 && target.email) {
    const team = await c.env.DB.prepare('SELECT name FROM teams WHERE id = ?').bind(admin.team_id).first<{ name: string }>();
    sendMagicLinkEmail(c, { email: target.email, name: target.name, teamName: team?.name ?? '', locale: target.locale, token: target.token });
  }
  return c.json({ success: true });
}

async function setCategoryActive(c: AppContext, active: 0 | 1) {
  await c.env.DB.prepare('UPDATE categories SET active = ? WHERE id = ? AND team_id = ?').bind(active, c.req.param('id'), teamOf(c)).run();
  return c.json({ success: true });
}

adminRoutes.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.email, u.email_verified, u.locale,
      EXISTS(SELECT 1 FROM points_log p WHERE p.from_user_id = u.id OR p.to_user_id = u.id) AS has_activity
    FROM users u WHERE u.team_id = ? ORDER BY u.active DESC, u.name ASC
  `).bind(teamOf(c)).all();
  return c.json(results);
});

adminRoutes.post('/users', async (c) => {
  const admin = c.get('user');
  const body = await readJsonObject(c);
  const name = normalizeName(body.name);
  if (!name) return apiError(c, 'NAME_INVALID');
  const email = normalizeOptionalEmail(body.email);
  if (email && await emailTaken(c.env.DB, email)) return apiError(c, 'EMAIL_TAKEN');

  const member = newUserCredentials();
  await c.env.DB.prepare("INSERT INTO users (id, team_id, name, role, active, token, email) VALUES (?, ?, ?, 'member', 1, ?, ?)")
    .bind(member.id, admin.team_id, name, member.token, email).run();
  if (email) sendMagicLinkEmail(c, { email, name, teamName: admin.team_name, locale: admin.locale, token: member.token });
  return c.json({ success: true, id: member.id });
});

adminRoutes.delete('/users/:id', (c) => setMemberActive(c, 0));
adminRoutes.patch('/users/:id/restore', (c) => setMemberActive(c, 1));

adminRoutes.delete('/users/:id/reject', async (c) => {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id'), admin.team_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_TEAM');
  if (!outranks(admin.role, target.role)) return apiError(c, 'ROLE_TOO_HIGH');
  if (target.active === 1) return apiError(c, 'MEMBER_STILL_ACTIVE');
  const activity = await c.env.DB.prepare('SELECT 1 FROM points_log WHERE from_user_id = ?1 OR to_user_id = ?1 LIMIT 1').bind(target.id).first();
  if (activity) return apiError(c, 'MEMBER_HAS_ACTIVITY');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ? AND team_id = ?').bind(target.id, admin.team_id).run();
  return c.json({ success: true });
});

adminRoutes.post('/users/:id/magic-link', async (c) => {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id'), admin.team_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_TEAM');
  if (!canManageLink(admin, target)) return apiError(c, 'ROLE_TOO_HIGH');
  return c.json({ url: magicLinkUrl(c, target.token) });
});

adminRoutes.post('/users/:id/regenerate-link', async (c) => {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id'), admin.team_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_TEAM');
  if (!canManageLink(admin, target)) return apiError(c, 'ROLE_TOO_HIGH');

  const newToken = crypto.randomUUID();
  await c.env.DB.prepare('UPDATE users SET token = ? WHERE id = ?').bind(newToken, target.id).run();
  const isSelf = target.id === admin.id;
  return c.json({ success: true, login_url: magicLinkUrl(c, newToken), is_self: isSelf, ...(isSelf && { token: newToken }) });
});

adminRoutes.post('/users/:id/resend-link', async (c) => {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id'), admin.team_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_TEAM');
  if (!target.email) return apiError(c, 'MEMBER_WITHOUT_EMAIL');
  sendMagicLinkEmail(c, { email: target.email, name: target.name, teamName: admin.team_name, locale: target.locale || admin.locale, token: target.token });
  return c.json({ success: true });
});

adminRoutes.post('/users/:id/pardon-spammer', async (c) => {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id'), admin.team_id);
  if (!target) return apiError(c, 'MEMBER_NOT_IN_TEAM');
  await c.env.DB.prepare('INSERT INTO dare_log (team_id, user_id, category_id, dare_text) VALUES (?, ?, NULL, ?)')
    .bind(admin.team_id, target.id, SPAMMER_PARDON_TEXT).run();
  return c.json({ success: true });
});

adminRoutes.get('/spammers', async (c) => c.json(spamWatchlist(await computeSpammers(c.env.DB, teamOf(c)))));

adminRoutes.get('/invite-link', async (c) => {
  const admin = c.get('user');
  const code = await getOrCreateInviteCode(c.env.DB, admin.team_id);
  return c.json({ code, url: joinUrl(c, code), team_name: admin.team_name });
});

adminRoutes.post('/regenerate-invite', async (c) => {
  const code = generateInviteCode();
  await c.env.DB.prepare('UPDATE teams SET invite_code = ? WHERE id = ?').bind(code, teamOf(c)).run();
  return c.json({ success: true, code, url: joinUrl(c, code) });
});

adminRoutes.post('/invite', async (c) => {
  const admin = c.get('user');
  const email = normalizeOptionalEmail((await readJsonObject(c)).email);
  if (!email) return apiError(c, 'EMAIL_INVALID');
  const code = await getOrCreateInviteCode(c.env.DB, admin.team_id);
  sendInBackground(c, email, buildInviteEmail({ isEn: admin.locale === 'en', inviterName: admin.name, teamName: admin.team_name, joinUrl: joinUrl(c, code) }));
  return c.json({ success: true });
});

adminRoutes.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM categories WHERE team_id = ?').bind(teamOf(c)).all();
  return c.json(results);
});

adminRoutes.post('/categories', async (c) => {
  const body = await readJsonObject(c);
  const name = normalizeName(body.name);
  const emoji = normalizeEmoji(body.emoji);
  if (!name || !emoji) return apiError(c, 'BADGE_INVALID');
  await c.env.DB.prepare('INSERT INTO categories (id, team_id, name, emoji) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), teamOf(c), name, emoji).run();
  return c.json({ success: true });
});

adminRoutes.delete('/categories/:id', (c) => setCategoryActive(c, 0));
adminRoutes.patch('/categories/:id/restore', (c) => setCategoryActive(c, 1));

adminRoutes.get('/dares', async (c) => {
  const [rules, pointTotals] = await Promise.all([fetchDareRules(c.env.DB, teamOf(c)), fetchPointTotals(c.env.DB, teamOf(c))]);
  return c.json(listActiveDares(rules, pointTotals));
});

adminRoutes.get('/rules', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT r.*, c.name as cat_name, c.emoji as cat_emoji
    FROM dare_rules r JOIN categories c ON r.category_id = c.id
    WHERE r.team_id = ?
  `).bind(teamOf(c)).all();
  return c.json(results);
});

async function announceDaresReachedByRuleChange(c: AppContext, rule: DareRule, previousThreshold: number | null) {
  const teamId = teamOf(c);
  const reached = membersReachedByRuleChange(await fetchPointTotals(c.env.DB, teamId), rule, previousThreshold);
  if (!reached.length) return;
  const category = await c.env.DB.prepare('SELECT name, emoji FROM categories WHERE id = ? AND team_id = ?')
    .bind(rule.category_id, teamId).first<{ name: string; emoji: string }>();
  if (!category) return;
  for (const { to_user_id } of reached) {
    const member = await c.env.DB.prepare('SELECT id, name, email, email_verified, locale FROM users WHERE id = ? AND team_id = ? AND active = 1')
      .bind(to_user_id, teamId).first<DareMember>();
    if (member) await announceDare(c, { teamId, member, category, dare: rule.dare_text, givenBy: null });
  }
}

adminRoutes.post('/rules', async (c) => {
  const body = await readJsonObject(c);
  const threshold = normalizeThreshold(body.threshold);
  const dareText = normalizeDareText(body.dare_text);
  if (!threshold || !dareText) return apiError(c, 'RULE_INVALID');
  const category = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ? AND team_id = ?')
    .bind(String(body.category_id ?? ''), teamOf(c)).first<{ id: string }>();
  if (!category) return apiError(c, 'CATEGORY_NOT_IN_TEAM');
  await c.env.DB.prepare('INSERT INTO dare_rules (id, team_id, category_id, threshold, dare_text) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), teamOf(c), category.id, threshold, dareText).run();
  c.executionCtx.waitUntil(announceDaresReachedByRuleChange(c, { category_id: category.id, threshold, dare_text: dareText }, null).catch(() => {}));
  return c.json({ success: true });
});

adminRoutes.patch('/rules/:id', async (c) => {
  const body = await readJsonObject(c);
  const threshold = normalizeThreshold(body.threshold);
  const dareText = normalizeDareText(body.dare_text);
  if (!threshold || !dareText) return apiError(c, 'RULE_INVALID');
  const previous = await c.env.DB.prepare('SELECT category_id, threshold FROM dare_rules WHERE id = ? AND team_id = ?')
    .bind(c.req.param('id'), teamOf(c)).first<{ category_id: string; threshold: number }>();
  if (!previous) return apiError(c, 'RULE_NOT_FOUND');
  await c.env.DB.prepare('UPDATE dare_rules SET threshold = ?, dare_text = ? WHERE id = ? AND team_id = ?')
    .bind(threshold, dareText, c.req.param('id'), teamOf(c)).run();
  if (threshold < previous.threshold) {
    c.executionCtx.waitUntil(announceDaresReachedByRuleChange(c, { category_id: previous.category_id, threshold, dare_text: dareText }, previous.threshold).catch(() => {}));
  }
  return c.json({ success: true });
});

adminRoutes.delete('/rules/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM dare_rules WHERE id = ? AND team_id = ?').bind(c.req.param('id'), teamOf(c)).run();
  return c.json({ success: true });
});

adminRoutes.post('/clear-category/:userId/:categoryId', async (c) => {
  const teamId = teamOf(c);
  const { userId, categoryId } = c.req.param();
  if (!await findTeamMember(c.env.DB, userId, teamId)) return apiError(c, 'USER_OUTSIDE_TEAM');

  const [count, rules] = await Promise.all([
    countPointsTowardsDare(c.env.DB, teamId, userId, categoryId),
    c.env.DB.prepare('SELECT threshold, dare_text FROM dare_rules WHERE category_id = ? AND team_id = ?')
      .bind(categoryId, teamId).all<{ threshold: number; dare_text: string }>(),
  ]);
  const clearedRule = highestReachedRule(count, rules.results ?? []);
  if (!clearedRule) return apiError(c, 'NO_ACTIVE_DARE');
  await c.env.DB.prepare('INSERT INTO dare_log (team_id, user_id, category_id, dare_text) VALUES (?, ?, ?, ?)')
    .bind(teamId, userId, categoryId, clearedRule.dare_text).run();
  return c.json({ success: true });
});

adminRoutes.get('/points-log', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.created_at, u_from.name as from_name, u_to.name as to_name, c.name as cat_name, c.emoji
    FROM points_log p
    JOIN users u_from ON p.from_user_id = u_from.id
    JOIN users u_to ON p.to_user_id = u_to.id
    JOIN categories c ON p.category_id = c.id
    WHERE p.team_id = ? ORDER BY p.created_at DESC LIMIT ?
  `).bind(teamOf(c), POINTS_LOG_LIMIT).all();
  return c.json(results);
});

adminRoutes.delete('/points/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM points_log WHERE id = ? AND team_id = ?').bind(c.req.param('id'), teamOf(c)).run();
  if (result.meta.changes === 0) return apiError(c, 'POINT_NOT_FOUND');
  return c.json({ success: true });
});

adminRoutes.get('/dare-log', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT dl.*, u.name as user_name, c.name as cat_name, c.emoji
    FROM dare_log dl JOIN users u ON dl.user_id = u.id LEFT JOIN categories c ON dl.category_id = c.id
    WHERE dl.team_id = ? ORDER BY dl.cleared_at DESC LIMIT ?
  `).bind(teamOf(c), DARE_LOG_LIMIT).all();
  return c.json(results);
});

adminRoutes.delete('/dare-log/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM dare_log WHERE id = ? AND team_id = ?').bind(c.req.param('id'), teamOf(c)).run();
  if (result.meta.changes === 0) return apiError(c, 'DARE_LOG_NOT_FOUND');
  return c.json({ success: true });
});
