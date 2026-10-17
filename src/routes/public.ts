import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../env';
import { apiError, readJsonObject } from '../http/errors';
import { ORGANIZATION_NAME_MAX_LENGTH, normalizeName, normalizeOptionalEmail } from '../domain/validation';
import { defaultCategoriesFor } from '../domain/defaultCategories';
import { emailTaken, newUserCredentials } from '../services/users';
import { sendMagicLinkEmail } from '../services/email';
import { passesTurnstile } from '../services/turnstile';
import { findJoinableTeam, generateInviteCode } from '../services/invites';

const TRACKED_EVENTS = new Set(['landing_vue', 'onboarding_soumis', 'join_vue', 'join_soumis']);
const EMPTY_BODY: Record<string, unknown> = {};

const logFailure = (operation: string) => (error: unknown) => console.error(`${operation}:`, error);

const INVALID_LINK_PAGE = `
  <div style="font-family:sans-serif; text-align:center; padding:50px; max-width:420px; margin:auto;">
    <h1>Oups ! ❌</h1>
    <p>Ce lien n'est plus valide ou l'utilisateur n'existe pas.</p>
    <p style="color:#64748b;font-size:14px">Tu as perdu ton lien ? Récupère-le par e-mail depuis la page d'accueil.</p>
    <a href="/?lost=1" style="display:inline-block;margin-top:12px;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Récupérer mon accès</a>
  </div>`;

function isSameOrigin(c: AppContext): boolean {
  const origin = c.req.header('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(c.req.url).host;
  } catch {
    return false;
  }
}

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/api/config', (c) => c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null }));

publicRoutes.post('/api/track', async (c) => {
  const { event } = await readJsonObject(c).catch(() => EMPTY_BODY);
  if (isSameOrigin(c) && typeof event === 'string' && TRACKED_EVENTS.has(event)) {
    await c.env.DB.prepare('INSERT INTO analytics_events (name) VALUES (?)').bind(event).run().catch(logFailure('track'));
  }
  return c.json({ ok: true });
});

publicRoutes.post('/api/onboarding', async (c) => {
  const body = await readJsonObject(c);
  const companyName = normalizeName(body.company_name, { min: 2, max: ORGANIZATION_NAME_MAX_LENGTH });
  const founderName = normalizeName(body.admin_name);
  const email = normalizeOptionalEmail(body.admin_email);
  const locale = body.locale === 'en' ? 'en' : 'fr';

  if (!companyName) return apiError(c, 'COMPANY_NAME_INVALID');
  if (!founderName) return apiError(c, 'NAME_INVALID');
  if (!await passesTurnstile(c, body.turnstile_token)) return apiError(c, 'TURNSTILE_FAILED');
  if (email && await emailTaken(c.env.DB, email)) return apiError(c, 'EMAIL_TAKEN');

  const companyId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const founder = newUserCredentials();
  const db = c.env.DB;
  await db.batch([
    db.prepare('INSERT INTO companies (id, name, active) VALUES (?, ?, 1)').bind(companyId, companyName),
    db.prepare('INSERT INTO teams (id, company_id, name, active, invite_code) VALUES (?, ?, ?, 1, ?)').bind(teamId, companyId, companyName, generateInviteCode()),
    db.prepare("INSERT INTO users (id, team_id, name, role, active, token, email, locale) VALUES (?, ?, ?, 'superadmin', 1, ?, ?, ?)")
      .bind(founder.id, teamId, founderName, founder.token, email, locale),
    ...defaultCategoriesFor(locale).map((category) =>
      db.prepare('INSERT INTO categories (id, team_id, name, emoji, forfeit, active) VALUES (?, ?, ?, ?, ?, 1)')
        .bind(crypto.randomUUID(), teamId, category.name, category.emoji, category.forfeit)),
  ]);

  if (email) sendMagicLinkEmail(c, { email, name: founderName, teamName: companyName, locale, token: founder.token });
  return c.json({ success: true, token: founder.token });
});

publicRoutes.get('/login/:token', async (c) => {
  const token = c.req.param('token');
  const user = await c.env.DB.prepare('SELECT id, email, email_verified FROM users WHERE token = ? AND active = 1')
    .bind(token).first<{ id: string; email: string | null; email_verified: number }>();
  if (!user) return c.html(INVALID_LINK_PAGE, 404);

  if (user.email && !user.email_verified) {
    await c.env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(user.id).run();
  }
  return c.redirect(`/#login=${token}`);
});

async function sendRecoveryLink(c: AppContext, rawEmail: unknown): Promise<void> {
  const email = normalizeOptionalEmail(rawEmail);
  if (!email) return;
  const user = await c.env.DB.prepare(`
    SELECT u.token, u.name, u.email, u.locale, t.name AS team_name
    FROM users u LEFT JOIN teams t ON t.id = u.team_id
    WHERE u.email = ? AND u.active = 1
  `).bind(email).first<{ token: string; name: string; email: string; locale: string | null; team_name: string | null }>();
  if (user) sendMagicLinkEmail(c, { email: user.email, name: user.name, teamName: user.team_name ?? '', locale: user.locale, token: user.token });
}

publicRoutes.post('/api/recover', async (c) => {
  const body = await readJsonObject(c).catch(() => EMPTY_BODY);
  if (!await passesTurnstile(c, body.turnstile_token)) return apiError(c, 'TURNSTILE_FAILED');
  await sendRecoveryLink(c, body.email).catch(logFailure('recover'));
  return c.json({ ok: true });
});

publicRoutes.get('/api/join/:code', async (c) => {
  const team = await findJoinableTeam(c.env.DB, c.req.param('code'));
  if (!team) return apiError(c, 'INVITE_INVALID');
  return c.json({ team_name: team.team_name, company_name: team.company_name });
});

publicRoutes.post('/api/join', async (c) => {
  const body = await readJsonObject(c);
  const name = normalizeName(body.name);
  if (!name) return apiError(c, 'NAME_INVALID');
  if (!await passesTurnstile(c, body.turnstile_token)) return apiError(c, 'TURNSTILE_FAILED');
  const team = await findJoinableTeam(c.env.DB, body.code);
  if (!team) return apiError(c, 'INVITE_INVALID');

  const newcomer = newUserCredentials();
  await c.env.DB.prepare("INSERT INTO users (id, team_id, name, role, active, token) VALUES (?, ?, ?, 'member', 0, ?)")
    .bind(newcomer.id, team.id, name, newcomer.token).run();
  return c.json({ success: true, pending: true });
});
