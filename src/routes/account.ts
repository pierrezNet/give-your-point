import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireUser } from '../middleware/auth';
import { apiError, readJsonObject } from '../http/errors';
import { isValidEmail } from '../domain/validation';
import { emailTaken, tokenOf } from '../services/users';
import { sendMagicLinkEmail } from '../services/email';
import { isKnownPushEndpoint, isPushKey } from '../services/push';

const SUPPORTED_LOCALES = new Set(['fr', 'en']);
const HISTORY_LIMIT = 20;
const DARE_HISTORY_LIMIT = 10;

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.get('/api/me', requireUser, (c) => {
  const { id, name, role, team_id, team_name, company_id, company_name, email, email_verified, locale } = c.get('user');
  return c.json({ id, name, role, team_id, team_name, company_id, company_name, email, email_verified, locale });
});

accountRoutes.patch('/api/me', requireUser, async (c) => {
  const me = c.get('user');
  const body = await readJsonObject(c);

  let email = me.email;
  if ('email' in body) {
    const requested = typeof body.email === 'string' ? body.email.trim() : '';
    if (requested && !isValidEmail(requested)) return apiError(c, 'EMAIL_INVALID');
    if (requested && await emailTaken(c.env.DB, requested, me.id)) return apiError(c, 'EMAIL_TAKEN');
    email = requested || null;
    if (email && email !== me.email) {
      await c.env.DB.prepare('UPDATE users SET email = ?, email_verified = 0 WHERE id = ?').bind(email, me.id).run();
      sendMagicLinkEmail(c, { email, name: me.name, teamName: me.team_name, locale: me.locale, token: await tokenOf(c.env.DB, me.id) });
    } else if (!email) {
      await c.env.DB.prepare('UPDATE users SET email = NULL, email_verified = 0 WHERE id = ?').bind(me.id).run();
    }
  }

  let locale = me.locale;
  if ('locale' in body) {
    if (typeof body.locale === 'string' && SUPPORTED_LOCALES.has(body.locale)) locale = body.locale;
    else if (body.locale === null || body.locale === '') locale = null;
    if (locale !== me.locale) await c.env.DB.prepare('UPDATE users SET locale = ? WHERE id = ?').bind(locale, me.id).run();
  }

  return c.json({ success: true, email, locale });
});

accountRoutes.get('/api/users', requireUser, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name, active FROM users WHERE team_id = ?').bind(c.get('user').team_id).all();
  return c.json(results);
});

accountRoutes.get('/api/categories', requireUser, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM categories WHERE active = 1 AND team_id = ?').bind(c.get('user').team_id).all();
  return c.json(results);
});

accountRoutes.get('/api/users/:id/history', requireUser, async (c) => {
  const me = c.get('user');
  const userId = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT team_id FROM users WHERE id = ?').bind(userId).first<{ team_id: string }>();
  if (target?.team_id !== me.team_id) return apiError(c, 'USER_OUTSIDE_TEAM');

  const [received, given, dares] = await Promise.all([
    c.env.DB.prepare(`
      SELECT p.*, u.name as from_name, c.emoji, c.name as cat_name
      FROM points_log p JOIN users u ON p.from_user_id = u.id JOIN categories c ON p.category_id = c.id
      WHERE p.to_user_id = ? AND p.team_id = ? ORDER BY p.created_at DESC LIMIT ?
    `).bind(userId, me.team_id, HISTORY_LIMIT).all(),
    c.env.DB.prepare(`
      SELECT p.*, u.name as to_name, c.emoji, c.name as cat_name
      FROM points_log p JOIN users u ON p.to_user_id = u.id JOIN categories c ON p.category_id = c.id
      WHERE p.from_user_id = ? AND p.team_id = ? ORDER BY p.created_at DESC LIMIT ?
    `).bind(userId, me.team_id, HISTORY_LIMIT).all(),
    c.env.DB.prepare(`
      SELECT dl.*, c.emoji, c.name as cat_name
      FROM dare_log dl JOIN categories c ON dl.category_id = c.id
      WHERE dl.user_id = ? AND dl.team_id = ? ORDER BY dl.cleared_at DESC LIMIT ?
    `).bind(userId, me.team_id, DARE_HISTORY_LIMIT).all(),
  ]);
  return c.json({ received: received.results, given: given.results, dares: dares.results });
});

accountRoutes.get('/api/push/vapid-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }));

accountRoutes.post('/api/push/subscribe', requireUser, async (c) => {
  const { endpoint, keys } = await readJsonObject(c);
  const { p256dh, auth } = (keys ?? {}) as { p256dh?: unknown; auth?: unknown };
  if (!isKnownPushEndpoint(endpoint) || !isPushKey(p256dh) || !isPushKey(auth)) return apiError(c, 'PUSH_SUBSCRIPTION_INVALID');
  await c.env.DB.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
  `).bind(c.get('user').id, endpoint, p256dh, auth).run();
  return c.json({ success: true });
});
