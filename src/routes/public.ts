import { Hono } from 'hono';
import type { AppContext, AppEnv } from '../env';
import { apiError, readJsonObject } from '../http/errors';
import { ORGANIZATION_NAME_MAX_LENGTH, normalizeName, normalizeOptionalEmail } from '../domain/validation';
import { DEFAULT_DARE_THRESHOLD, defaultCategoriesFor } from '../domain/defaultCategories';
import { emailTaken, newUserCredentials } from '../services/users';
import { sendMagicLinkEmail } from '../services/email';
import { passesTurnstile } from '../services/turnstile';
import { findJoinableTeam, generateInviteCode } from '../services/invites';

const TRACKED_EVENTS = new Set(['landing_vue', 'onboarding_soumis', 'join_vue', 'join_soumis']);
const EMPTY_BODY: Record<string, unknown> = {};

const logFailure = (operation: string) => (error: unknown) => console.error(`${operation}:`, error);

const INVALID_LINK_COPY = {
  fr: {
    title: 'Oups ! ❌',
    message: "Ce lien n'est plus valide ou l'utilisateur n'existe pas.",
    hint: "Tu as perdu ton lien ? Récupère-le par e-mail depuis la page d'accueil.",
    action: 'Récupérer mon accès',
    home: '/',
  },
  en: {
    title: 'Oops! ❌',
    message: 'This link is no longer valid or the user does not exist.',
    hint: 'Lost your link? Get it again by email from the home page.',
    action: 'Recover my access',
    home: '/en/',
  },
};

function invalidLinkPage(language: 'fr' | 'en'): string {
  const copy = INVALID_LINK_COPY[language];
  return `<!DOCTYPE html>
<html lang="${language}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>${copy.title}</title><link rel="stylesheet" href="/styles.css"></head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-6">
  <main class="max-w-md text-center bg-white rounded-3xl shadow-xl p-8 space-y-3">
    <h1 class="text-2xl font-black text-slate-800">${copy.title}</h1>
    <p class="text-slate-700">${copy.message}</p>
    <p class="text-sm text-slate-600">${copy.hint}</p>
    <a href="${copy.home}?lost=1" class="inline-block mt-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700">${copy.action}</a>
  </main>
</body>
</html>`;
}

const preferredLanguage = (c: AppContext): 'fr' | 'en' => ((c.req.header('Accept-Language') ?? '').toLowerCase().startsWith('en') ? 'en' : 'fr');

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
    ...defaultCategoriesFor(locale).flatMap((category) => {
      const categoryId = crypto.randomUUID();
      return [
        db.prepare('INSERT INTO categories (id, team_id, name, emoji, active) VALUES (?, ?, ?, ?, 1)').bind(categoryId, teamId, category.name, category.emoji),
        db.prepare('INSERT INTO dare_rules (id, team_id, category_id, threshold, dare_text) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), teamId, categoryId, DEFAULT_DARE_THRESHOLD, category.dare),
      ];
    }),
  ]);

  if (email) sendMagicLinkEmail(c, { email, name: founderName, teamName: companyName, locale, token: founder.token });
  return c.json({ success: true, token: founder.token });
});

publicRoutes.get('/login/:token', async (c) => {
  const token = c.req.param('token');
  const user = await c.env.DB.prepare('SELECT id, email, email_verified FROM users WHERE token = ? AND active = 1')
    .bind(token).first<{ id: string; email: string | null; email_verified: number }>();
  if (!user) return c.html(invalidLinkPage(preferredLanguage(c)), 404);

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
  const email = normalizeOptionalEmail(body.email);
  const locale = body.locale === 'en' ? 'en' : 'fr';
  if (!name) return apiError(c, 'NAME_INVALID');
  if (typeof body.email === 'string' && body.email.trim() && !email) return apiError(c, 'EMAIL_INVALID');
  if (!await passesTurnstile(c, body.turnstile_token)) return apiError(c, 'TURNSTILE_FAILED');
  const team = await findJoinableTeam(c.env.DB, body.code);
  if (!team) return apiError(c, 'INVITE_INVALID');
  if (email && await emailTaken(c.env.DB, email)) return apiError(c, 'EMAIL_TAKEN');

  const newcomer = newUserCredentials();
  await c.env.DB.prepare("INSERT INTO users (id, team_id, name, role, active, token, email, locale) VALUES (?, ?, ?, 'member', 0, ?, ?, ?)")
    .bind(newcomer.id, team.id, name, newcomer.token, email, locale).run();
  return c.json({ success: true, pending: true });
});
