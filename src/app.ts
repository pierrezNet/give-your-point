import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { decodeb64url, encryptPushPayload, vapidJwt } from './push/crypto'
import { fillOgPlaceholders, languageFromAcceptLanguage, ogDataFor, type OgPage } from './og'
import { buildDigestEmail, buildGageEmail, buildInviteEmail, buildPointEmail, buildWelcomeEmail } from './email/templates'
import { ADMIN_ROLES, ROLE_RANK, SUPERADMIN_ROLES, canManageLink, outranks, type Role } from './domain/roles'
import { detectSpammers, spamWatchlist, SPAM_WINDOW_DAYS, type SpamStatus } from './domain/spam'
import { dareProgressAfterPoint, listActiveDares, type DareRule, type PointTotal } from './domain/dares'
import { buildLeaderboard } from './domain/leaderboard'
import { DUPLICATE_WINDOW_MINUTES, MAX_POINTS_PER_DAY, MAX_POINTS_PER_RECIPIENT_PER_DAY, UNDO_WINDOW_SECONDS, findPointRefusal, normalizeReason, type PointRefusal } from './domain/pointRules'
import { ORGANIZATION_NAME_MAX_LENGTH, isValidEmail, normalizeName, normalizeOptionalEmail } from './domain/validation'

export type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY_JWK: string
  VAPID_SUBJECT: string
  TURNSTILE_SITE_KEY: string
  TURNSTILE_SECRET_KEY: string
  RESEND_API_KEY: string
  RESEND_FROM_EMAIL: string
  CRON_SECRET: string
  APP_BASE_URL: string
}

const DEFAULT_CATEGORIES_FR = [
  { name: 'Méchanceté',         emoji: '👿', forfeit: 'Viennoiseries' },
  { name: 'Super blague',       emoji: '😂', forfeit: 'Continue ainsi' },
  { name: 'Flemme',             emoji: '😴', forfeit: 'Chouquettes' },
  { name: 'Désespérance',       emoji: '😩', forfeit: '1 séance chez le psy' },
  { name: 'Colère',             emoji: '😡', forfeit: 'Chocolats' },
  { name: 'Blague affligeante', emoji: '😓', forfeit: 'Bonbons' },
  { name: 'Mauvaise foi',       emoji: '🤷', forfeit: 'Jus de fruits' },
];

const DEFAULT_CATEGORIES_EN = [
  { name: 'Meanness',     emoji: '👿', forfeit: 'Pastries' },
  { name: 'Great joke',   emoji: '😂', forfeit: 'Keep going' },
  { name: 'Laziness',     emoji: '😴', forfeit: 'Donuts' },
  { name: 'Despair',      emoji: '😩', forfeit: 'Therapy session' },
  { name: 'Anger',        emoji: '😡', forfeit: 'Chocolates' },
  { name: 'Bad joke',     emoji: '😓', forfeit: 'Candy' },
  { name: 'Bad faith',    emoji: '🤷', forfeit: 'Juice' },
];

function defaultCategoriesFor(locale: string | null | undefined) {
  return locale === 'en' ? DEFAULT_CATEGORIES_EN : DEFAULT_CATEGORIES_FR;
}

// Unicité : vrai si cet e-mail est déjà associé à un autre compte.
async function emailTaken(db: D1Database, email: string, exceptId?: string): Promise<boolean> {
  const row = exceptId
    ? await db.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").bind(email, exceptId).first()
    : await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  return !!row;
}

// Code d'invitation opaque et partageable pour une équipe (16 hex).
function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

const CANONICAL_BASE_URL = 'https://donnetonpoint.fr';
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function appBaseUrl(c: AppContext): string {
  if (c.env.APP_BASE_URL) return c.env.APP_BASE_URL;
  const host = c.req.header('Host') || '';
  if (LOCAL_HOST_PATTERN.test(host)) return `http://${host}`;
  return CANONICAL_BASE_URL;
}

async function sendEmail(env: Bindings, to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend ${res.status}:`, body);
    }
  } catch (e) {
    console.error('Email error:', e);
  }
}

async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
  if (!token || !secret) {
    console.log('[turnstile] missing input', { hasToken: !!token, hasSecret: !!secret });
    return false;
  }
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data: any = await res.json();
    if (!data.success) {
      console.log('[turnstile] rejected', { 'error-codes': data['error-codes'], hostname: data.hostname });
    }
    return data.success === true;
  } catch (e) {
    console.error('[turnstile] fetch error:', e);
    return false;
  }
}

type Variables = {
  user: AuthUser
}

interface AuthUser {
  id: string
  name: string
  role: Role
  active: number
  team_id: string
  team_name: string
  company_id: string
  company_name: string
  email: string | null
  email_verified: number
  locale: string | null
}

type AppEnv = { Bindings: Bindings; Variables: Variables }
type AppContext = Context<AppEnv>

const app = new Hono<AppEnv>()

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
}

app.use('*', async (c, next) => {
  await next();
  const response = new Response(c.res.body, c.res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  c.res = response;
});

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: 'Requête invalide' }, 400);
  console.error(err);
  return c.json({ error: 'Erreur interne' }, 500);
});

// Canonicalisation de l'hôte : www.* → apex en 301, pour n'avoir qu'un seul domaine indexé.
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }
  return next();
});

async function computeSpammers(db: D1Database, teamId: string): Promise<Map<string, SpamStatus>> {
  const window = `-${SPAM_WINDOW_DAYS} days`;
  const [givenRes, receivedRes, usersRes, pardonRes] = await Promise.all([
    db.prepare("SELECT from_user_id AS uid, COUNT(*) as n FROM points_log WHERE team_id = ? AND created_at >= datetime('now', ?) GROUP BY from_user_id").bind(teamId, window).all<{ uid: string; n: number }>(),
    db.prepare("SELECT to_user_id AS uid, COUNT(*) as n FROM points_log WHERE team_id = ? AND created_at >= datetime('now', ?) GROUP BY to_user_id").bind(teamId, window).all<{ uid: string; n: number }>(),
    db.prepare("SELECT id, name FROM users WHERE active = 1 AND team_id = ?").bind(teamId).all<{ id: string; name: string }>(),
    db.prepare("SELECT DISTINCT user_id FROM dare_log WHERE team_id = ? AND category_id IS NULL AND cleared_at >= datetime('now', ?)").bind(teamId, window).all<{ user_id: string }>(),
  ]);
  return detectSpammers({
    activeUsers: usersRes.results ?? [],
    givenByUser: new Map((givenRes.results ?? []).map((row) => [row.uid, row.n])),
    receivedByUser: new Map((receivedRes.results ?? []).map((row) => [row.uid, row.n])),
    pardonedUserIds: new Set((pardonRes.results ?? []).map((row) => row.user_id)),
  });
}

async function fetchPointTotals(db: D1Database, teamId: string): Promise<PointTotal[]> {
  const { results } = await db.prepare(
    "SELECT to_user_id, category_id, COUNT(*) as total FROM points_log WHERE team_id = ? GROUP BY to_user_id, category_id"
  ).bind(teamId).all<PointTotal>();
  return results ?? [];
}

async function fetchDareRules(db: D1Database, teamId: string): Promise<DareRule[]> {
  const { results } = await db.prepare("SELECT * FROM dare_rules WHERE team_id = ?").bind(teamId).all<DareRule>();
  return results ?? [];
}

async function getUsersStats(db: D1Database, teamId: string) {
  const [categoriesRes, pointTotals, rules, usersRes, spamStatuses] = await Promise.all([
    db.prepare("SELECT id, name, emoji FROM categories WHERE team_id = ?").bind(teamId).all<{ id: string; name: string; emoji: string }>(),
    fetchPointTotals(db, teamId),
    fetchDareRules(db, teamId),
    db.prepare("SELECT id, name FROM users WHERE active = 1 AND team_id = ?").bind(teamId).all<{ id: string; name: string }>(),
    computeSpammers(db, teamId),
  ]);
  const spammerIds = new Set([...spamStatuses].filter(([, status]) => status.flagged).map(([userId]) => userId));
  return buildLeaderboard({ users: usersRes.results ?? [], categories: categoriesRes.results ?? [], pointTotals, rules, spammerIds });
}

async function getUserByToken(db: D1Database, token: string): Promise<AuthUser | null> {
  return db.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.team_id, u.email, u.email_verified, u.locale,
           t.name AS team_name, t.company_id,
           c.name AS company_name
    FROM users u
    JOIN teams t ON t.id = u.team_id
    JOIN companies c ON c.id = t.company_id
    WHERE u.token = ? AND u.active = 1 AND t.active = 1 AND c.active = 1
  `).bind(token).first<AuthUser>();
}

const SSE_PATH = '/api/events';

function extractToken(c: AppContext): string | null {
  const header = c.req.header('Authorization');
  if (header) return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (c.req.path === SSE_PATH) return c.req.query('t') || null;
  return null;
}

const FORBIDDEN_MESSAGE: Record<Role, string> = {
  member: 'Accès refusé',
  admin: 'Accès admin requis',
  superadmin: 'Accès superadmin requis',
  owner: 'Accès owner requis',
};

const requireRole = (minimumRole: Role) => createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: 'Non autorisé' }, 401);
  const user = await getUserByToken(c.env.DB, token);
  if (!user) return c.json({ error: 'Session invalide' }, 401);
  if (ROLE_RANK[user.role] < ROLE_RANK[minimumRole]) return c.json({ error: FORBIDDEN_MESSAGE[minimumRole] }, 403);
  c.set('user', user);
  await next();
});

const requireUser = requireRole('member');
const requireAdmin = requireRole('admin');
const requireSuperadmin = requireRole('superadmin');
const requireOwner = requireRole('owner');

function newUserCredentials(): { id: string; token: string } {
  return { id: crypto.randomUUID(), token: crypto.randomUUID() };
}

function magicLinkUrl(c: AppContext, token: string): string {
  return `${appBaseUrl(c)}/login/${token}`;
}

async function sendPushToUser(env: Bindings, toUserId: string, fromUserName: string, categoryId: string): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK) return;

  const [subsResult, catResult] = await Promise.all([
    env.DB.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
      .bind(toUserId).all<{ id: number; endpoint: string; p256dh: string; auth: string }>(),
    env.DB.prepare("SELECT name, emoji FROM categories WHERE id = ?")
      .bind(categoryId).first<{ name: string; emoji: string }>(),
  ]);

  if (!subsResult.results?.length) return;

  const privateKeyJwk: JsonWebKey = JSON.parse(
    new TextDecoder().decode(decodeb64url(env.VAPID_PRIVATE_KEY_JWK))
  );
  const catStr = catResult ? `${catResult.emoji} ${catResult.name}` : 'un badge';
  const payload = JSON.stringify({
    title: '🎯 Donne Ton Point',
    body: `${fromUserName} t'a donné un point pour ${catStr} !`,
    url: '/',
  });

  await Promise.all(subsResult.results.map(async (sub) => {
    try {
      const jwt = await vapidJwt(sub.endpoint, env.VAPID_SUBJECT || 'mailto:admin@example.com', privateKeyJwk);
      const encrypted = await encryptPushPayload(payload, sub.p256dh, sub.auth);
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'Authorization': `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
          'TTL': '60',
        },
        body: encrypted,
      });
      if (res.status === 410 || res.status === 404) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
      }
    } catch (e) {
      console.error('Push send error:', e);
    }
  }));
}

app.get('/api/me', requireUser, async (c) => {
  const u = c.get('user');
  return c.json({
    id: u.id,
    name: u.name,
    role: u.role,
    team_id: u.team_id,
    team_name: u.team_name,
    company_id: u.company_id,
    company_name: u.company_name,
    email: u.email,
    email_verified: u.email_verified,
    locale: u.locale,
  });
});

// Mise à jour de son propre profil (email et/ou locale)
app.patch('/api/me', requireUser, async (c) => {
  const u = c.get('user');
  const body = await c.req.json();
  const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
  const hasLocale = Object.prototype.hasOwnProperty.call(body, 'locale');

  let cleanEmail = u.email;
  if (hasEmail) {
    const emailRaw = (body.email || '').trim();
    cleanEmail = emailRaw === '' ? null : (isValidEmail(emailRaw) ? emailRaw : null);
    if (emailRaw !== '' && cleanEmail === null) {
      return c.json({ error: "Email invalide" }, 400);
    }
    if (cleanEmail && await emailTaken(c.env.DB, cleanEmail, u.id)) {
      return c.json({ error: "Cet e-mail est déjà utilisé par un autre compte." }, 409);
    }
    if (cleanEmail && cleanEmail !== u.email) {
      // Nouvel e-mail → repart non vérifié, on envoie un lien de confirmation.
      await c.env.DB.prepare("UPDATE users SET email = ?, email_verified = 0 WHERE id = ?").bind(cleanEmail, u.id).run();
      const loginUrl = `${appBaseUrl(c)}/login/${u.id}`;
      const mail = buildWelcomeEmail({ isEn: u.locale === 'en', name: u.name, teamName: u.team_name, loginUrl });
      c.executionCtx.waitUntil(sendEmail(c.env, cleanEmail, mail.subject, mail.html));
    } else if (cleanEmail === null) {
      await c.env.DB.prepare("UPDATE users SET email = NULL, email_verified = 0 WHERE id = ?").bind(u.id).run();
    }
  }

  let cleanLocale = u.locale;
  if (hasLocale) {
    const localeRaw = body.locale;
    if (localeRaw === 'fr' || localeRaw === 'en') {
      cleanLocale = localeRaw;
      await c.env.DB.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(cleanLocale, u.id).run();
    } else if (localeRaw === null || localeRaw === '') {
      cleanLocale = null;
      await c.env.DB.prepare("UPDATE users SET locale = NULL WHERE id = ?").bind(u.id).run();
    }
  }

  return c.json({ success: true, email: cleanEmail, locale: cleanLocale });
});

// Liste des membres de l'équipe de l'utilisateur authentifié
app.get('/api/users', requireUser, async (c) => {
  const u = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, active FROM users WHERE team_id = ?'
  ).bind(u.team_id).all();
  return c.json(results);
});

// Catégories actives de l'équipe
app.get('/api/categories', requireUser, async (c) => {
  const u = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE active = 1 AND team_id = ?'
  ).bind(u.team_id).all();
  return c.json(results);
});

const POINT_REFUSAL_MESSAGE: Record<PointRefusal, (recipientName: string) => string> = {
  DUPLICATE: () => "Tu viens déjà d'offrir ce badge à cette personne ! 😄",
  DAILY_LIMIT: () => `Tu as distribué tes ${MAX_POINTS_PER_DAY} points du jour ! Reviens demain 🌙`,
  RECIPIENT_DAILY_LIMIT: (recipientName) => `Tu as déjà bien félicité ${recipientName} aujourd'hui (${MAX_POINTS_PER_RECIPIENT_PER_DAY} max) 😄`,
  SPAMMER_FROZEN: () => "🚨 Tu es signalé comme spammeur. Un admin doit valider ton gage (régaler l'équipe) avant que tu puisses redonner des points.",
};

function pointRefusalMessage(refusal: PointRefusal, recipientName: string): string {
  return POINT_REFUSAL_MESSAGE[refusal](recipientName);
}

app.post('/api/points', requireUser, async (c) => {
  try {
    const body = await c.req.json();
    const { to_user_id, category_id } = body;
    const reason = normalizeReason(body.reason);
    const fromUser = c.get('user');

    if (fromUser.id === to_user_id) {
      return c.json({ error: "Interdit de s'auto-mousser ! 😅" }, 400);
    }

    // Vérifier que le destinataire est dans la même équipe
    const toUser = await c.env.DB.prepare(
      "SELECT id, name, team_id, active, email, email_verified, locale FROM users WHERE id = ?"
    ).bind(to_user_id).first<{ id: string; name: string; team_id: string; active: number; email: string | null; email_verified: number; locale: string | null }>();

    if (!toUser || toUser.active !== 1 || toUser.team_id !== fromUser.team_id) {
      return c.json({ error: "Ce collègue n'est pas dans ton équipe." }, 403);
    }

    // Vérifier que la catégorie est dans la même équipe (et récupérer name+emoji pour notifs)
    const cat = await c.env.DB.prepare(
      "SELECT id, name, emoji FROM categories WHERE id = ? AND team_id = ? AND active = 1"
    ).bind(category_id, fromUser.team_id).first<{ id: string; name: string; emoji: string }>();

    if (!cat) {
      return c.json({ error: "Catégorie invalide pour ton équipe." }, 400);
    }

    const [recentDuplicate, givenToday, givenToRecipientToday, spamStatuses] = await Promise.all([
      c.env.DB.prepare(`
        SELECT 1 FROM points_log
        WHERE from_user_id = ? AND to_user_id = ? AND category_id = ?
        AND created_at >= datetime('now', ?)
      `).bind(fromUser.id, to_user_id, category_id, `-${DUPLICATE_WINDOW_MINUTES} minutes`).first(),
      c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM points_log WHERE from_user_id = ? AND created_at >= date('now')"
      ).bind(fromUser.id).first<{ count: number }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM points_log WHERE from_user_id = ? AND to_user_id = ? AND created_at >= date('now')"
      ).bind(fromUser.id, to_user_id).first<{ count: number }>(),
      computeSpammers(c.env.DB, fromUser.team_id),
    ]);

    const refusal = findPointRefusal({
      sameBadgeToRecipientRecently: !!recentDuplicate,
      givenToday: givenToday?.count ?? 0,
      givenToRecipientToday: givenToRecipientToday?.count ?? 0,
      isFlaggedSpammer: spamStatuses.get(fromUser.id)?.flagged ?? false,
    });
    if (refusal) return c.json({ error: pointRefusalMessage(refusal, toUser.name) }, 429);

    await c.env.DB.prepare(
      'INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, reason, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
    )
    .bind(fromUser.team_id, fromUser.id, to_user_id, category_id, reason)
    .run();

    // Vérifier si un gage vient d'être déclenché ou est à 1 point
    const [newCountRes, rulesRes] = await Promise.all([
      c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM points_log WHERE team_id = ? AND to_user_id = ? AND category_id = ?"
      ).bind(fromUser.team_id, to_user_id, category_id).first<{ count: number }>(),
      c.env.DB.prepare(
        "SELECT dare_text, threshold FROM dare_rules WHERE team_id = ? AND category_id = ? ORDER BY threshold ASC"
      ).bind(fromUser.team_id, category_id).all<{ dare_text: string; threshold: number }>(),
    ]);

    const progress = dareProgressAfterPoint(newCountRes?.count ?? 0, rulesRes.results ?? []);
    const gageTriggered = progress?.kind === 'triggered' ? { name: toUser.name, dare: progress.dare } : null;
    const gageWarning = progress?.kind === 'warning' ? { name: toUser.name } : null;

    // Notification push non-bloquante
    c.executionCtx.waitUntil(
      sendPushToUser(c.env, to_user_id, fromUser.name, category_id).catch(() => {})
    );

    // Notification email non-bloquante (uniquement si l'e-mail est vérifié).
    // Si ce point vient de déclencher un gage, on envoie le mail de gage à la place.
    if (toUser.email && toUser.email_verified) {
      const isEn = toUser.locale === 'en';
      const baseUrl = appBaseUrl(c);
      const catLabel = `${cat.emoji} ${cat.name}`;
      const mail = gageTriggered
        ? buildGageEmail({ isEn, name: toUser.name, fromName: fromUser.name, catLabel, dare: gageTriggered.dare, baseUrl })
        : buildPointEmail({ isEn, name: toUser.name, fromName: fromUser.name, catLabel, baseUrl });
      c.executionCtx.waitUntil(sendEmail(c.env, toUser.email, mail.subject, mail.html));
    }

    return c.json({ success: true, gageTriggered, gageWarning });

  } catch (err) {
    console.error("Erreur D1:", err);
    return c.json({ success: false, error: "Erreur serveur" }, 500);
  }
});

app.get('/api/users-stats', requireUser, async (c) => {
  try {
    const u = c.get('user');
    return c.json(await getUsersStats(c.env.DB, u.team_id));
  } catch (e: any) {
    console.error("🔥 Erreur Stats:", e.message);
    return c.json({ error: "Erreur calcul stats" }, 500);
  }
});

// Activité agrégée des équipes de la même société (preuve sociale inter-services).
// Étanchéité préservée : totaux par équipe uniquement, aucun individu ni détail de points.
app.get('/api/company/teams-activity', requireUser, async (c) => {
  const u = c.get('user');
  const [teamsRes, topCatsRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT t.id, t.name,
        (SELECT COUNT(*) FROM users WHERE team_id = t.id AND active = 1) AS members,
        (SELECT COUNT(*) FROM points_log p WHERE p.team_id = t.id AND p.created_at >= datetime('now','-7 days')) AS points_7d,
        (SELECT COUNT(DISTINCT from_user_id) FROM points_log p WHERE p.team_id = t.id AND p.created_at >= datetime('now','-7 days')) AS givers,
        (SELECT COUNT(DISTINCT category_id) FROM points_log p WHERE p.team_id = t.id AND p.created_at >= datetime('now','-7 days')) AS categories_used
      FROM teams t
      WHERE t.company_id = ? AND t.active = 1
      ORDER BY points_7d DESC, t.name ASC
    `).bind(u.company_id).all(),
    c.env.DB.prepare(`
      SELECT p.team_id, c.name AS cat_name, COUNT(*) AS n
      FROM points_log p
      JOIN categories c ON c.id = p.category_id
      JOIN teams t ON t.id = p.team_id
      WHERE t.company_id = ? AND p.created_at >= datetime('now','-7 days')
      GROUP BY p.team_id, p.category_id
      ORDER BY n DESC
    `).bind(u.company_id).all<{ team_id: string; cat_name: string; n: number }>(),
  ]);

  // Catégorie dominante par équipe (le 1er de chaque équipe = le plus fréquent, ordre DESC).
  const topCat = new Map<string, string>();
  for (const row of (topCatsRes.results || [])) {
    if (!topCat.has(row.team_id)) topCat.set(row.team_id, row.cat_name);
  }
  const teams = (teamsRes.results || []).map((t: any) => ({ ...t, top_category: topCat.get(t.id) || null }));

  return c.json({ company_name: u.company_name, my_team_id: u.team_id, teams });
});

app.get('/api/stats', requireUser, async (c) => {
  const u = c.get('user');
  const teamId = u.team_id;

  // Période : 7 j / 30 j / tout (défaut 30). Filtre les tops, catégories, heatmap et gages.
  const periodParam = c.req.query('period');
  const period = periodParam === '7' || periodParam === 'all' ? periodParam : '30';
  const days = period === '7' ? 7 : period === 'all' ? 0 : 30;
  const pf = days ? `AND p.created_at >= datetime('now', '-${days} days')` : '';   // alias points_log = p
  const cf = days ? `AND created_at >= datetime('now', '-${days} days')` : '';     // sans alias
  const df = days ? `AND dl.cleared_at >= datetime('now', '-${days} days')` : '';  // alias dare_log = dl

  const [giversRes, receiversRes, catsRes, matrixRes, gagesRes, gageLogRes, totalRes, evolutionRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT u.id, u.name, COUNT(*) as total
      FROM points_log p JOIN users u ON p.from_user_id = u.id
      WHERE u.active = 1 AND p.team_id = ? ${pf}
      GROUP BY p.from_user_id ORDER BY total DESC LIMIT 50
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT u.id, u.name, COUNT(*) as total
      FROM points_log p JOIN users u ON p.to_user_id = u.id
      WHERE u.active = 1 AND p.team_id = ? ${pf}
      GROUP BY p.to_user_id ORDER BY total DESC LIMIT 50
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT c.name, c.emoji, COUNT(*) as total
      FROM points_log p JOIN categories c ON p.category_id = c.id
      WHERE p.team_id = ? ${pf}
      GROUP BY p.category_id ORDER BY total DESC
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT u_from.id as from_id, u_from.name as from_name, u_to.id as to_id, u_to.name as to_name, COUNT(*) as total
      FROM points_log p
      JOIN users u_from ON p.from_user_id = u_from.id
      JOIN users u_to ON p.to_user_id = u_to.id
      WHERE u_from.active = 1 AND u_to.active = 1 AND p.team_id = ? ${pf}
      GROUP BY p.from_user_id, p.to_user_id
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT u.id, u.name, COUNT(*) as total
      FROM dare_log dl JOIN users u ON dl.user_id = u.id
      WHERE dl.team_id = ? AND dl.category_id IS NOT NULL AND u.active = 1 ${df}
      GROUP BY dl.user_id ORDER BY total DESC LIMIT 50
    `).bind(teamId).all(),
    // Détail des gages tombés (survit à l'effacement des points par clear-category).
    c.env.DB.prepare(`
      SELECT dl.id, u.name, c.name AS category, c.emoji, dl.dare_text, dl.cleared_at
      FROM dare_log dl JOIN users u ON dl.user_id = u.id JOIN categories c ON dl.category_id = c.id
      WHERE dl.team_id = ? AND dl.category_id IS NOT NULL AND u.active = 1 ${df}
      ORDER BY dl.cleared_at DESC LIMIT 30
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM points_log WHERE team_id = ? ${cf}
    `).bind(teamId).first<{ total: number }>(),
    c.env.DB.prepare(`
      SELECT strftime('%Y-%W', created_at) as week, COUNT(*) as total
      FROM points_log WHERE team_id = ?
      GROUP BY week ORDER BY week DESC LIMIT 12
    `).bind(teamId).all(),
  ]);

  const givers = (giversRes.results || []) as any[];
  const receivers = (receiversRes.results || []) as any[];
  const gages = (gagesRes.results || []) as any[];

  // « Toi cette période » : rang + compteurs perso de l'appelant.
  const giverIdx = givers.findIndex(x => x.id === u.id);
  const receiverIdx = receivers.findIndex(x => x.id === u.id);
  const me = {
    given: giverIdx >= 0 ? givers[giverIdx].total : 0,
    received: receiverIdx >= 0 ? receivers[receiverIdx].total : 0,
    rankGiver: giverIdx >= 0 ? giverIdx + 1 : null,
    rankReceiver: receiverIdx >= 0 ? receiverIdx + 1 : null,
    gages: gages.find(x => x.id === u.id)?.total || 0,
  };

  return c.json({
    period,
    totalPoints: totalRes?.total || 0,
    me,
    givers,
    receivers,
    gages,
    gageLog: gageLogRes.results || [],
    categories: catsRes.results || [],
    matrix: matrixRes.results || [],
    evolution: (evolutionRes.results || []).reverse(),
  });
});

app.get('/api/events', requireUser, async (c) => {
  const u = c.get('user');
  const teamId = u.team_id;
  return streamSSE(c, async (stream) => {
    const send = async () => {
      const data = await getUsersStats(c.env.DB, teamId);
      await stream.writeSSE({ data: JSON.stringify(data), event: 'stats' });
    };
    await send();
    while (true) {
      await stream.sleep(10000);
      if (stream.aborted) break;
      await send();
    }
  });
});

// === Console owner : vue globale des sociétés inscrites ===

app.get('/api/owner/companies', requireOwner, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      c.id,
      c.name,
      c.active,
      c.created_at,
      (SELECT COUNT(*) FROM teams WHERE company_id = c.id AND active = 1) AS team_count,
      (SELECT COUNT(*) FROM users u JOIN teams t ON t.id = u.team_id
         WHERE t.company_id = c.id AND u.active = 1) AS member_count,
      (SELECT GROUP_CONCAT(u.name, ', ') FROM users u JOIN teams t ON t.id = u.team_id
         WHERE t.company_id = c.id AND u.active = 1
           AND u.role IN ('admin','superadmin','owner')) AS admins,
      (SELECT COUNT(*) FROM points_log p JOIN teams t ON t.id = p.team_id
         WHERE t.company_id = c.id) AS total_points,
      (SELECT MAX(p.created_at) FROM points_log p JOIN teams t ON t.id = p.team_id
         WHERE t.company_id = c.id) AS last_point_at,
      (SELECT COUNT(*) FROM points_log p JOIN teams t ON t.id = p.team_id
         WHERE t.company_id = c.id AND p.created_at >= datetime('now', '-7 days')) AS points_last_7d
    FROM companies c
    ORDER BY c.created_at DESC
  `).all();
  return c.json(results);
});

// Suppression définitive d'une société (cascade complète), réservée à l'owner.
// Sert à purger les sociétés ventouses / dormantes depuis la console owner.
app.delete('/api/owner/companies/:id', requireOwner, async (c) => {
  const owner = c.get('user');
  const id = c.req.param('id');

  // Anti-lockout : l'owner ne peut pas supprimer sa propre société.
  if (id === owner.company_id) {
    return c.json({ error: "Impossible de supprimer ta propre société." }, 400);
  }

  const company = await c.env.DB.prepare("SELECT id FROM companies WHERE id = ?").bind(id).first();
  if (!company) return c.json({ error: "Société introuvable." }, 404);

  // Même cascade que la purge RGPD (migrations/cleanup-inactive.sql). D1 batch = transactionnel.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id IN (SELECT u.id FROM users u JOIN teams t ON t.id = u.team_id WHERE t.company_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM dare_log WHERE team_id IN (SELECT id FROM teams WHERE company_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM points_log WHERE team_id IN (SELECT id FROM teams WHERE company_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM dare_rules WHERE team_id IN (SELECT id FROM teams WHERE company_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM categories WHERE team_id IN (SELECT id FROM teams WHERE company_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM users WHERE team_id IN (SELECT id FROM teams WHERE company_id = ?)").bind(id),
    c.env.DB.prepare("DELETE FROM teams WHERE company_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM companies WHERE id = ?").bind(id),
  ]);

  return c.json({ success: true });
});

// Config publique (clé Turnstile exposée au frontend)
app.get('/api/config', async (c) => {
  return c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null });
});

// === Instrumentation minimale de l'entonnoir (mesure) ===

// Événements whitelistés — cookieless, sans PII, stockés dans notre D1 (EU).
const TRACKED_EVENTS = new Set(['landing_vue', 'onboarding_soumis', 'join_vue', 'join_soumis']);

function isSameOrigin(c: AppContext): boolean {
  const origin = c.req.header('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(c.req.url).host;
  } catch {
    return false;
  }
}

app.post('/api/track', async (c) => {
  try {
    if (!isSameOrigin(c)) return c.json({ ok: true });
    const { event } = await c.req.json();
    if (typeof event === 'string' && TRACKED_EVENTS.has(event)) {
      await c.env.DB.prepare("INSERT INTO analytics_events (name) VALUES (?)").bind(event).run();
    }
  } catch { /* fire-and-forget : jamais bloquant */ }
  return c.json({ ok: true });
});

// Entonnoir agrégé sur 30 jours (réservé à l'owner).
app.get('/api/owner/funnel', requireOwner, async (c) => {
  const empty = {
    landing_vue: 0, onboarding_soumis: 0, join_vue: 0, join_soumis: 0,
    espaces_crees_30j: 0, espaces_actives_30j: 0,
  };
  try {
    const [eventsRes, createdRes, activatedRes] = await Promise.all([
      c.env.DB.prepare(`
        SELECT name, COUNT(*) as total FROM analytics_events
        WHERE created_at >= datetime('now', '-30 days') GROUP BY name
      `).all<{ name: string; total: number }>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as n FROM companies WHERE created_at >= datetime('now', '-30 days')
      `).first<{ n: number }>(),
      c.env.DB.prepare(`
        SELECT COUNT(DISTINCT t.company_id) as n
        FROM teams t
        JOIN companies co ON co.id = t.company_id
        JOIN points_log p ON p.team_id = t.id
        WHERE co.created_at >= datetime('now', '-30 days')
      `).first<{ n: number }>(),
    ]);
    const ev = new Map((eventsRes.results || []).map(r => [r.name, r.total]));
    return c.json({
      landing_vue: ev.get('landing_vue') || 0,
      onboarding_soumis: ev.get('onboarding_soumis') || 0,
      join_vue: ev.get('join_vue') || 0,
      join_soumis: ev.get('join_soumis') || 0,
      espaces_crees_30j: createdRes?.n || 0,
      espaces_actives_30j: activatedRes?.n || 0,
    });
  } catch (e) {
    // Table analytics pas encore migrée : on renvoie des zéros plutôt qu'une 500.
    return c.json(empty);
  }
});

// Onboarding autonome : crée company + team + superadmin + 7 catégories
app.post('/api/onboarding', async (c) => {
  try {
    const { company_name, admin_name, admin_email, locale, turnstile_token } = await c.req.json();

    const company = normalizeName(company_name, { min: 2, max: ORGANIZATION_NAME_MAX_LENGTH });
    const admin = normalizeName(admin_name);
    const email = normalizeOptionalEmail(admin_email);
    const userLocale = locale === 'en' ? 'en' : 'fr';

    if (!company) {
      return c.json({ error: "Nom de société requis (2 à 60 caractères)" }, 400);
    }
    if (!admin) {
      return c.json({ error: "Prénom requis (1 à 40 caractères)" }, 400);
    }

    const ip = c.req.header('CF-Connecting-IP') || undefined;
    const ok = await verifyTurnstile(turnstile_token, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!ok) {
      return c.json({ error: "Vérification anti-bot échouée. Réessaie." }, 403);
    }

    if (email && await emailTaken(c.env.DB, email)) {
      return c.json({ error: "Cet e-mail est déjà utilisé par un autre compte." }, 409);
    }

    const companyId = crypto.randomUUID();
    const teamId = crypto.randomUUID();
    const founder = newUserCredentials();
    const inviteCode = generateInviteCode();
    const categories = defaultCategoriesFor(userLocale);

    const statements = [
      c.env.DB.prepare("INSERT INTO companies (id, name, active) VALUES (?, ?, 1)").bind(companyId, company),
      c.env.DB.prepare("INSERT INTO teams (id, company_id, name, active, invite_code) VALUES (?, ?, ?, 1, ?)").bind(teamId, companyId, company, inviteCode),
      c.env.DB.prepare("INSERT INTO users (id, team_id, name, role, active, token, email, locale) VALUES (?, ?, ?, 'superadmin', 1, ?, ?, ?)").bind(founder.id, teamId, admin, founder.token, email, userLocale),
      ...categories.map(cat =>
        c.env.DB.prepare("INSERT INTO categories (id, team_id, name, emoji, forfeit, active) VALUES (?, ?, ?, ?, ?, 1)")
          .bind(crypto.randomUUID(), teamId, cat.name, cat.emoji, cat.forfeit)
      ),
    ];

    await c.env.DB.batch(statements);

    // Lien magique de bienvenue au fondateur (si email fourni)
    if (email) {
      const mail = buildWelcomeEmail({ isEn: userLocale === 'en', name: admin, teamName: company, loginUrl: magicLinkUrl(c, founder.token) });
      c.executionCtx.waitUntil(sendEmail(c.env, email, mail.subject, mail.html));
    }

    return c.json({ success: true, token: founder.token });
  } catch (err: any) {
    console.error("Erreur onboarding:", err);
    return c.json({ error: "Erreur lors de la création de l'espace" }, 500);
  }
});

// Route pour le lien magique : /login/ton-token-unique
app.get('/login/:token', async (c) => {
  const token = c.req.param('token');

  const user = await c.env.DB.prepare(
    'SELECT id, email, email_verified FROM users WHERE token = ? AND active = 1'
  ).bind(token).first<{ id: string; email: string | null; email_verified: number }>();

  if (!user) {
    return c.html(`
      <div style="font-family:sans-serif; text-align:center; padding:50px; max-width:420px; margin:auto;">
        <h1>Oups ! ❌</h1>
        <p>Ce lien n'est plus valide ou l'utilisateur n'existe pas.</p>
        <p style="color:#64748b;font-size:14px">Tu as perdu ton lien ? Récupère-le par e-mail depuis la page d'accueil.</p>
        <a href="/?lost=1" style="display:inline-block;margin-top:12px;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Récupérer mon accès</a>
      </div>
    `, 404);
  }

  // Vérification implicite : se connecter via le lien reçu par mail confirme l'adresse.
  if (user.email && !user.email_verified) {
    await c.env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(user.id).run();
  }

  return c.redirect(`/#login=${token}`);
});

// « Lien perdu » : renvoie son lien magique à qui possède l'adresse. Public, protégé par Turnstile.
// Réponse TOUJOURS identique (anti-énumération : on ne révèle jamais si l'e-mail existe).
app.post('/api/recover', async (c) => {
  try {
    const { email, turnstile_token } = await c.req.json();
    const ip = c.req.header('CF-Connecting-IP') || undefined;
    if (!(await verifyTurnstile(turnstile_token, c.env.TURNSTILE_SECRET_KEY, ip))) {
      return c.json({ error: "Vérification anti-bot échouée. Réessaie." }, 403);
    }
    const clean = (email || '').trim();
    if (clean && isValidEmail(clean)) {
      const user = await c.env.DB.prepare(`
        SELECT u.token, u.name, u.email, u.locale, t.name AS team_name
        FROM users u LEFT JOIN teams t ON t.id = u.team_id
        WHERE u.email = ? AND u.active = 1
      `).bind(clean).first<{ token: string; name: string; email: string; locale: string | null; team_name: string | null }>();
      if (user) {
        const mail = buildWelcomeEmail({ isEn: user.locale === 'en', name: user.name, teamName: user.team_name || '', loginUrl: magicLinkUrl(c, user.token) });
        c.executionCtx.waitUntil(sendEmail(c.env, user.email, mail.subject, mail.html));
      }
    }
  } catch { /* on ne révèle rien */ }
  return c.json({ ok: true }); // identique quoi qu'il arrive
});

// === Auto-inscription via lien d'invitation d'équipe ===

// Infos publiques d'un lien d'invitation (nom d'équipe + société), ou 404 si invalide.
app.get('/api/join/:code', async (c) => {
  const code = c.req.param('code');
  const team = await c.env.DB.prepare(`
    SELECT t.name AS team_name, c.name AS company_name
    FROM teams t JOIN companies c ON c.id = t.company_id
    WHERE t.invite_code = ? AND t.active = 1 AND c.active = 1
  `).bind(code).first<{ team_name: string; company_name: string }>();
  if (!team) return c.json({ error: "Lien d'invitation invalide ou expiré." }, 404);
  return c.json(team);
});

// Le visiteur muni du lien s'ajoute lui-même comme membre.
app.post('/api/join', async (c) => {
  try {
    const { code, name, turnstile_token } = await c.req.json();
    const cleanName = normalizeName(name);
    if (!cleanName) {
      return c.json({ error: "Prénom requis (1 à 40 caractères)" }, 400);
    }
    // Anti-bot : le lien d'auto-inscription est public → on protège la création de compte.
    const ip = c.req.header('CF-Connecting-IP') || undefined;
    if (!(await verifyTurnstile(turnstile_token, c.env.TURNSTILE_SECRET_KEY, ip))) {
      return c.json({ error: "Vérification anti-bot échouée. Réessaie." }, 403);
    }
    const team = await c.env.DB.prepare(`
      SELECT t.id FROM teams t JOIN companies c ON c.id = t.company_id
      WHERE t.invite_code = ? AND t.active = 1 AND c.active = 1
    `).bind(code).first<{ id: string }>();
    if (!team) return c.json({ error: "Lien d'invitation invalide ou expiré." }, 404);

    const newcomer = newUserCredentials();
    await c.env.DB.prepare(
      "INSERT INTO users (id, team_id, name, role, active, token) VALUES (?, ?, ?, 'member', 0, ?)"
    ).bind(newcomer.id, team.id, cleanName, newcomer.token).run();
    return c.json({ success: true, pending: true });
  } catch (err) {
    console.error("Erreur join:", err);
    return c.json({ error: "Erreur lors de l'inscription" }, 500);
  }
});

// === Routes admin (scope = équipe de l'admin) ===

app.get('/api/admin/users', requireAdmin, async (c) => {
  const admin = c.get('user');
  // has_activity : a-t-il déjà donné/reçu au moins un point ? Sert à distinguer un membre
  // "en attente de validation" (auto-inscrit, active=0, aucune activité) d'un "désactivé".
  const users = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.email, u.email_verified, u.locale, EXISTS(
      SELECT 1 FROM points_log p WHERE p.from_user_id = u.id OR p.to_user_id = u.id
    ) AS has_activity
    FROM users u WHERE u.team_id = ? ORDER BY u.active DESC, u.name ASC
  `).bind(admin.team_id).all();
  return c.json(users.results);
});

interface TeamMember { id: string; name: string; role: Role; active: number; email: string | null; locale: string | null; token: string }

async function findTeamMember(db: D1Database, userId: string, teamId: string): Promise<TeamMember | null> {
  return db.prepare("SELECT id, name, role, active, email, locale, token FROM users WHERE id = ? AND team_id = ?")
    .bind(userId, teamId).first<TeamMember>();
}

async function findCompanyMember(db: D1Database, userId: string, companyId: string): Promise<TeamMember | null> {
  return db.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.email, u.locale, u.token
    FROM users u JOIN teams t ON t.id = u.team_id
    WHERE u.id = ? AND t.company_id = ?
  `).bind(userId, companyId).first<TeamMember>();
}

const MEMBER_NOT_IN_TEAM = "Membre introuvable dans ton équipe.";
const MEMBER_NOT_IN_COMPANY = "Utilisateur introuvable dans ta société.";
const ROLE_TOO_HIGH = "Action réservée à un rôle supérieur à celui de ce membre.";

async function setMemberActive(c: AppContext, active: 0 | 1) {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id') ?? '', admin.team_id);
  if (!target) return c.json({ error: MEMBER_NOT_IN_TEAM }, 404);
  if (target.id === admin.id) return c.json({ error: "Tu ne peux pas modifier ton propre statut." }, 400);
  if (!outranks(admin.role, target.role)) return c.json({ error: ROLE_TOO_HIGH }, 403);
  await c.env.DB.prepare("UPDATE users SET active = ? WHERE id = ?").bind(active, target.id).run();
  return c.json({ success: true });
}

app.patch('/api/admin/users/:id/restore', requireAdmin, (c) => setMemberActive(c, 1));

app.post('/api/admin/users/:id/magic-link', requireAdmin, async (c) => {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id'), admin.team_id);
  if (!target) return c.json({ error: MEMBER_NOT_IN_TEAM }, 404);
  if (!canManageLink(admin, target)) return c.json({ error: ROLE_TOO_HIGH }, 403);
  return c.json({ url: magicLinkUrl(c, target.token) });
});

app.post('/api/admin/users', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { name, email } = await c.req.json();
  const cleanName = normalizeName(name);
  if (!cleanName) return c.json({ error: "Prénom requis (1 à 40 caractères)" }, 400);
  const cleanEmail = normalizeOptionalEmail(email);
  if (cleanEmail && await emailTaken(c.env.DB, cleanEmail)) {
    return c.json({ error: "Cet e-mail est déjà utilisé par un autre compte." }, 409);
  }
  const member = newUserCredentials();
  await c.env.DB.prepare(
    "INSERT INTO users (id, team_id, name, role, active, token, email) VALUES (?, ?, ?, 'member', 1, ?, ?)"
  ).bind(member.id, admin.team_id, cleanName, member.token, cleanEmail).run();

  if (cleanEmail) {
    const mail = buildWelcomeEmail({ isEn: admin.locale === 'en', name: cleanName, teamName: admin.team_name, loginUrl: magicLinkUrl(c, member.token) });
    c.executionCtx.waitUntil(sendEmail(c.env, cleanEmail, mail.subject, mail.html));
  }

  return c.json({ success: true, id: member.id });
});

// Renvoyer à un membre son lien magique par e-mail (réservé admin).
app.post('/api/admin/users/:id/resend-link', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  const user = await findTeamMember(c.env.DB, id, admin.team_id);
  if (!user) return c.json({ error: MEMBER_NOT_IN_TEAM }, 404);
  if (!user.email) return c.json({ error: "Ce membre n'a pas d'e-mail." }, 400);
  const mail = buildWelcomeEmail({ isEn: (user.locale || admin.locale) === 'en', name: user.name, teamName: admin.team_name, loginUrl: magicLinkUrl(c, user.token) });
  c.executionCtx.waitUntil(sendEmail(c.env, user.email, mail.subject, mail.html));
  return c.json({ success: true });
});

// Lien d'auto-inscription de l'équipe de l'admin (génération paresseuse si absent).
async function getOrCreateInviteCode(db: D1Database, teamId: string): Promise<string> {
  const team = await db.prepare("SELECT invite_code FROM teams WHERE id = ?").bind(teamId).first<{ invite_code: string | null }>();
  if (team?.invite_code) return team.invite_code;
  const code = generateInviteCode();
  await db.prepare("UPDATE teams SET invite_code = ? WHERE id = ?").bind(code, teamId).run();
  return code;
}

app.get('/api/team-invite', requireAdmin, async (c) => {
  const admin = c.get('user');
  const code = await getOrCreateInviteCode(c.env.DB, admin.team_id);
  const origin = appBaseUrl(c);
  return c.json({ code, url: `${origin}/join/${code}`, team_name: admin.team_name });
});

// Kill switch : régénère le code d'invitation → l'ancien lien (fuité/abusé pour créer de faux comptes) meurt.
app.post('/api/admin/regenerate-invite', requireAdmin, async (c) => {
  const admin = c.get('user');
  const code = generateInviteCode();
  await c.env.DB.prepare("UPDATE teams SET invite_code = ? WHERE id = ?").bind(code, admin.team_id).run();
  return c.json({ success: true, code, url: `${appBaseUrl(c)}/join/${code}` });
});

// Rejeter un auto-inscrit "en attente" = suppression définitive. Garde-fou : uniquement si inactif
// ET sans aucune activité (aucune ligne points_log) → suppression sûre, pas de cascade à gérer.
app.delete('/api/admin/users/:id/reject', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  const u = await findTeamMember(c.env.DB, id, admin.team_id);
  if (!u) return c.json({ error: MEMBER_NOT_IN_TEAM }, 404);
  if (!outranks(admin.role, u.role)) return c.json({ error: ROLE_TOO_HIGH }, 403);
  if (u.active === 1) return c.json({ error: "Ce membre est actif — désactive-le plutôt." }, 400);
  const activity = await c.env.DB.prepare("SELECT 1 FROM points_log WHERE from_user_id = ? OR to_user_id = ? LIMIT 1").bind(id, id).first();
  if (activity) return c.json({ error: "Ce membre a déjà une activité — désactive-le plutôt." }, 400);
  await c.env.DB.prepare("DELETE FROM users WHERE id = ? AND team_id = ?").bind(id, admin.team_id).run();
  return c.json({ success: true });
});

// Envoyer le lien d'invitation par email (réutilise Resend).
app.post('/api/admin/invite', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { email } = await c.req.json();
  const clean = normalizeOptionalEmail(email);
  if (!clean) return c.json({ error: "Email invalide" }, 400);

  const code = await getOrCreateInviteCode(c.env.DB, admin.team_id);
  const joinUrl = `${appBaseUrl(c)}/join/${code}`;
  const { subject, html } = buildInviteEmail({ isEn: admin.locale === 'en', inviterName: admin.name, teamName: admin.team_name, joinUrl });
  c.executionCtx.waitUntil(sendEmail(c.env, clean, subject, html));
  return c.json({ success: true });
});

app.post('/api/admin/categories', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { name, emoji } = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO categories (id, team_id, name, emoji) VALUES (?, ?, ?, ?)"
  ).bind(id, admin.team_id, name, emoji).run();
  return c.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (c) => setMemberActive(c, 0));

app.get('/api/admin/categories', requireAdmin, async (c) => {
  const admin = c.get('user');
  const cats = await c.env.DB.prepare(
    "SELECT * FROM categories WHERE team_id = ?"
  ).bind(admin.team_id).all();
  return c.json(cats.results);
});

app.delete('/api/admin/categories/:id', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE categories SET active = 0 WHERE id = ? AND team_id = ?"
  ).bind(id, admin.team_id).run();
  return c.json({ success: true });
});

app.patch('/api/admin/categories/:id/restore', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE categories SET active = 1 WHERE id = ? AND team_id = ?"
  ).bind(id, admin.team_id).run();
  return c.json({ success: true });
});

// Spammeurs actifs de l'équipe (gage automatique non encore "régalé").
app.get('/api/admin/spammers', requireAdmin, async (c) => {
  return c.json(spamWatchlist(await computeSpammers(c.env.DB, c.get('user').team_id)));
});

// "Amende honorable" : le spammeur a régalé l'équipe → on logue (historique) et on le blanchit 7 j.
app.post('/api/admin/users/:id/pardon-spammer', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  const target = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND team_id = ?").bind(id, admin.team_id).first();
  if (!target) return c.json({ error: "Membre introuvable dans ton équipe." }, 404);
  // Entrée dare_log SANS catégorie = marqueur "spammeur régalé" (suspend le flag 7 j + trace l'historique).
  await c.env.DB.prepare(
    "INSERT INTO dare_log (team_id, user_id, category_id, dare_text) VALUES (?, ?, NULL, ?)"
  ).bind(admin.team_id, id, "🚨 Spammeur — a régalé l'équipe ☕").run();
  return c.json({ success: true });
});

app.post('/api/admin/users/:id/regenerate-link', requireAdmin, async (c) => {
  const admin = c.get('user');
  const target = await findTeamMember(c.env.DB, c.req.param('id'), admin.team_id);
  if (!target) return c.json({ error: MEMBER_NOT_IN_TEAM }, 404);
  if (!canManageLink(admin, target)) return c.json({ error: ROLE_TOO_HIGH }, 403);

  const newToken = crypto.randomUUID();
  await c.env.DB.prepare("UPDATE users SET token = ? WHERE id = ?").bind(newToken, target.id).run();

  const isSelf = target.id === admin.id;
  return c.json({ success: true, login_url: magicLinkUrl(c, newToken), is_self: isSelf, ...(isSelf && { token: newToken }) });
});

app.get('/api/admin/dares', requireAdmin, async (c) => {
  const teamId = c.get('user').team_id;
  const [rules, pointTotals] = await Promise.all([fetchDareRules(c.env.DB, teamId), fetchPointTotals(c.env.DB, teamId)]);
  return c.json(listActiveDares(rules, pointTotals));
});

app.get('/api/admin/rules', requireAdmin, async (c) => {
  const admin = c.get('user');
  const rules = await c.env.DB.prepare(`
    SELECT r.*, c.name as cat_name, c.emoji as cat_emoji
    FROM dare_rules r
    JOIN categories c ON r.category_id = c.id
    WHERE r.team_id = ?
  `).bind(admin.team_id).all();
  return c.json(rules.results);
});

app.post('/api/admin/rules', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { category_id, threshold, dare_text } = await c.req.json();

  // Vérifier que la catégorie appartient à l'équipe de l'admin
  const cat = await c.env.DB.prepare(
    "SELECT id FROM categories WHERE id = ? AND team_id = ?"
  ).bind(category_id, admin.team_id).first();

  if (!cat) {
    return c.json({ error: "Catégorie invalide pour cette équipe." }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO dare_rules (id, team_id, category_id, threshold, dare_text) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, admin.team_id, category_id, threshold, dare_text).run();
  return c.json({ success: true });
});

app.delete('/api/admin/rules/:id', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "DELETE FROM dare_rules WHERE id = ? AND team_id = ?"
  ).bind(id, admin.team_id).run();
  return c.json({ success: true });
});

app.patch('/api/admin/rules/:id', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  const { threshold, dare_text } = await c.req.json();
  await c.env.DB.prepare(
    "UPDATE dare_rules SET threshold = ?, dare_text = ? WHERE id = ? AND team_id = ?"
  ).bind(threshold, dare_text, id, admin.team_id).run();
  return c.json({ success: true });
});

// Historique d'un utilisateur (lisible uniquement par les membres de la même équipe)
app.get('/api/users/:id/history', requireUser, async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');

  // Vérifier que l'utilisateur cible est dans la même équipe
  const target = await c.env.DB.prepare(
    "SELECT team_id FROM users WHERE id = ?"
  ).bind(id).first<{ team_id: string }>();

  if (!target || target.team_id !== me.team_id) {
    return c.json({ error: "Utilisateur introuvable dans ton équipe." }, 403);
  }

  const received = await c.env.DB.prepare(`
      SELECT p.*, u.name as from_name, c.emoji, c.name as cat_name
      FROM points_log p
      JOIN users u ON p.from_user_id = u.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.to_user_id = ? AND p.team_id = ?
      ORDER BY p.created_at DESC LIMIT 20
  `).bind(id, me.team_id).all();

  const given = await c.env.DB.prepare(`
    SELECT p.*, u.name as to_name, c.emoji, c.name as cat_name
    FROM points_log p
    JOIN users u ON p.to_user_id = u.id
    JOIN categories c ON p.category_id = c.id
    WHERE p.from_user_id = ? AND p.team_id = ?
    ORDER BY p.created_at DESC LIMIT 20
  `).bind(id, me.team_id).all();

  const dares = await c.env.DB.prepare(`
    SELECT dl.*, c.emoji, c.name as cat_name
    FROM dare_log dl
    JOIN categories c ON dl.category_id = c.id
    WHERE dl.user_id = ? AND dl.team_id = ?
    ORDER BY dl.cleared_at DESC LIMIT 10
  `).bind(id, me.team_id).all();

  return c.json({ received: received.results, given: given.results, dares: dares.results });
});

app.get('/api/admin/points-log', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT
      p.id,
      p.created_at,
      u_from.name as from_name,
      u_to.name as to_name,
      c.name as cat_name,
      c.emoji
    FROM points_log p
    JOIN users u_from ON p.from_user_id = u_from.id
    JOIN users u_to ON p.to_user_id = u_to.id
    JOIN categories c ON p.category_id = c.id
    WHERE p.team_id = ?
    ORDER BY p.created_at DESC
    LIMIT 50
  `).bind(admin.team_id).all();
  return c.json(results);
});

app.delete('/api/admin/points/:id', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    "DELETE FROM points_log WHERE id = ? AND team_id = ?"
  ).bind(id, admin.team_id).run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Point introuvable dans ton équipe" }, 404);
  }

  return c.json({ success: true, message: "Point supprimé avec succès" });
});

app.post('/api/points/undo', requireUser, async (c) => {
  const me = c.get('user');

  const result = await c.env.DB.prepare(`
    DELETE FROM points_log
    WHERE id = (
        SELECT id FROM points_log
        WHERE from_user_id = ?
        AND created_at >= datetime('now', ?)
        ORDER BY created_at DESC LIMIT 1
    )
  `).bind(me.id, `-${UNDO_WINDOW_SECONDS} seconds`).run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Délai d'annulation dépassé" }, 403);
  }

  return c.json({ success: true });
});

app.post('/api/admin/clear-category/:userId/:categoryId', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { userId, categoryId } = c.req.param();

  try {
    // Vérifier que l'utilisateur cible est dans la team de l'admin
    const target = await c.env.DB.prepare(
      "SELECT team_id FROM users WHERE id = ?"
    ).bind(userId).first<{ team_id: string }>();

    if (!target || target.team_id !== admin.team_id) {
      return c.json({ error: "Utilisateur hors de ton équipe." }, 403);
    }

    const rule = await c.env.DB.prepare(
      "SELECT dare_text FROM dare_rules WHERE category_id = ? AND team_id = ?"
    ).bind(categoryId, admin.team_id).first<{ dare_text: string }>();

    if (rule) {
      await c.env.DB.prepare(
        "INSERT INTO dare_log (team_id, user_id, category_id, dare_text) VALUES (?, ?, ?, ?)"
      ).bind(admin.team_id, userId, categoryId, rule.dare_text).run();
    }

    await c.env.DB.prepare(`
      DELETE FROM points_log
      WHERE to_user_id = ? AND category_id = ? AND team_id = ?
    `).bind(userId, categoryId, admin.team_id).run();

    return c.json({ success: true, message: "Compteur catégorie réinitialisé." });
  } catch (err) {
    return c.json({ error: "Erreur lors de la remise à zéro" }, 500);
  }
});

app.get('/api/admin/dare-log', requireAdmin, async (c) => {
  const admin = c.get('user');
  // LEFT JOIN : les entrées "spammeur régalé" n'ont pas de catégorie (category_id NULL).
  const { results } = await c.env.DB.prepare(`
    SELECT dl.*, u.name as user_name, c.name as cat_name, c.emoji
    FROM dare_log dl
    JOIN users u ON dl.user_id = u.id
    LEFT JOIN categories c ON dl.category_id = c.id
    WHERE dl.team_id = ?
    ORDER BY dl.cleared_at DESC
    LIMIT 50
  `).bind(admin.team_id).all();
  return c.json(results);
});

// CRUD : supprimer une entrée d'historique de gage acquitté (annuler un acquittement).
app.delete('/api/admin/dare-log/:id', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  const result = await c.env.DB.prepare(
    "DELETE FROM dare_log WHERE id = ? AND team_id = ?"
  ).bind(id, admin.team_id).run();
  if (result.meta.changes === 0) return c.json({ error: "Entrée introuvable." }, 404);
  return c.json({ success: true });
});

// === Routes superadmin (scope = société du superadmin) ===

// Liste les équipes de la société, avec admins et nombre de membres actifs
app.get('/api/superadmin/teams', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT
      t.id,
      t.name,
      t.active,
      t.created_at,
      (SELECT COUNT(*) FROM users WHERE team_id = t.id AND active = 1) AS member_count,
      (SELECT GROUP_CONCAT(u.name, ', ')
         FROM users u
         WHERE u.team_id = t.id
           AND u.active = 1
           AND u.role IN ('admin','superadmin','owner')
      ) AS admins
    FROM teams t
    WHERE t.company_id = ?
    ORDER BY t.active DESC, t.name ASC
  `).bind(sa.company_id).all();
  return c.json(results);
});

// Créer une équipe dans la société du superadmin
app.post('/api/superadmin/teams', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const teamName = normalizeName((await c.req.json()).name, { max: ORGANIZATION_NAME_MAX_LENGTH });
  if (!teamName) return c.json({ error: 'Nom requis (1 à 60 caractères)' }, 400);
  const id = crypto.randomUUID();
  const inviteCode = generateInviteCode();
  await c.env.DB.prepare(
    "INSERT INTO teams (id, company_id, name, active, invite_code) VALUES (?, ?, ?, 1, ?)"
  ).bind(id, sa.company_id, teamName, inviteCode).run();
  return c.json({ success: true, id });
});

// Renommer une équipe
app.patch('/api/superadmin/teams/:id', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const id = c.req.param('id');
  const teamName = normalizeName((await c.req.json()).name, { max: ORGANIZATION_NAME_MAX_LENGTH });
  if (!teamName) return c.json({ error: 'Nom requis (1 à 60 caractères)' }, 400);
  const result = await c.env.DB.prepare(
    "UPDATE teams SET name = ? WHERE id = ? AND company_id = ?"
  ).bind(teamName, id, sa.company_id).run();
  if (result.meta.changes === 0) return c.json({ error: "Équipe introuvable" }, 404);
  return c.json({ success: true });
});

// Désactiver une équipe (soft delete)
app.delete('/api/superadmin/teams/:id', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const id = c.req.param('id');
  // Refuser si c'est la team du superadmin lui-même (sinon il se locke dehors)
  if (id === sa.team_id) {
    return c.json({ error: "Tu ne peux pas désactiver ta propre équipe." }, 400);
  }
  const result = await c.env.DB.prepare(
    "UPDATE teams SET active = 0 WHERE id = ? AND company_id = ?"
  ).bind(id, sa.company_id).run();
  if (result.meta.changes === 0) return c.json({ error: "Équipe introuvable" }, 404);
  return c.json({ success: true });
});

// Réactiver une équipe
app.patch('/api/superadmin/teams/:id/restore', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const id = c.req.param('id');
  const result = await c.env.DB.prepare(
    "UPDATE teams SET active = 1 WHERE id = ? AND company_id = ?"
  ).bind(id, sa.company_id).run();
  if (result.meta.changes === 0) return c.json({ error: "Équipe introuvable" }, 404);
  return c.json({ success: true });
});

// Créer un user directement dans une équipe (avec option admin)
app.post('/api/superadmin/teams/:id/users', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const teamId = c.req.param('id');
  const { name, role, email } = await c.req.json();
  const cleanName = normalizeName(name);
  if (!cleanName) return c.json({ error: 'Nom requis (1 à 40 caractères)' }, 400);
  const userRole = (role === 'admin' || role === 'superadmin') ? role : 'member';
  const cleanEmail = normalizeOptionalEmail(email);

  // Vérifier que la team appartient à la société du superadmin
  const team = await c.env.DB.prepare(
    "SELECT id, name FROM teams WHERE id = ? AND company_id = ?"
  ).bind(teamId, sa.company_id).first<{ id: string; name: string }>();
  if (!team) return c.json({ error: "Équipe introuvable dans ta société" }, 404);

  if (cleanEmail && await emailTaken(c.env.DB, cleanEmail)) {
    return c.json({ error: "Cet e-mail est déjà utilisé par un autre compte." }, 409);
  }

  const member = newUserCredentials();
  await c.env.DB.prepare(
    "INSERT INTO users (id, team_id, name, role, active, token, email) VALUES (?, ?, ?, ?, 1, ?, ?)"
  ).bind(member.id, teamId, cleanName, userRole, member.token, cleanEmail).run();

  const loginUrl = magicLinkUrl(c, member.token);
  if (cleanEmail) {
    const mail = buildWelcomeEmail({ isEn: sa.locale === 'en', name: cleanName, teamName: team.name, loginUrl });
    c.executionCtx.waitUntil(sendEmail(c.env, cleanEmail, mail.subject, mail.html));
  }

  return c.json({ success: true, id: member.id, login_url: loginUrl });
});

// Liste les admins et superadmins de la société
app.get('/api/superadmin/admins', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.team_id, t.name AS team_name
    FROM users u
    JOIN teams t ON t.id = u.team_id
    WHERE t.company_id = ?
      AND u.role IN ('admin', 'superadmin', 'owner')
    ORDER BY t.name ASC, u.name ASC
  `).bind(sa.company_id).all();
  return c.json(results);
});

// Liste tous les users actifs de la société (pour pouvoir choisir qui promouvoir)
app.get('/api/superadmin/users', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.team_id, t.name AS team_name
    FROM users u
    JOIN teams t ON t.id = u.team_id
    WHERE t.company_id = ?
    ORDER BY t.name ASC, u.active DESC, u.name ASC
  `).bind(sa.company_id).all();
  return c.json(results);
});

app.post('/api/superadmin/users/:id/magic-link', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const target = await findCompanyMember(c.env.DB, c.req.param('id'), sa.company_id);
  if (!target) return c.json({ error: MEMBER_NOT_IN_COMPANY }, 404);
  if (!canManageLink(sa, target)) return c.json({ error: ROLE_TOO_HIGH }, 403);
  return c.json({ url: magicLinkUrl(c, target.token) });
});

// Promouvoir un user en admin ou superadmin
app.post('/api/superadmin/users/:id/promote', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const id = c.req.param('id');
  const { role } = await c.req.json();
  if (role !== 'admin' && role !== 'superadmin') {
    return c.json({ error: "Rôle invalide (admin ou superadmin uniquement)" }, 400);
  }
  const target = await findCompanyMember(c.env.DB, id, sa.company_id);
  if (!target) return c.json({ error: MEMBER_NOT_IN_COMPANY }, 404);
  if (!outranks(sa.role, target.role)) return c.json({ error: ROLE_TOO_HIGH }, 403);

  await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();
  return c.json({ success: true });
});

// Révoquer le rôle admin/superadmin (retour à member)
app.post('/api/superadmin/users/:id/demote', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const id = c.req.param('id');

  // Anti-lockout : refuser si c'est le dernier superadmin actif de la société
  const target = await c.env.DB.prepare(`
    SELECT u.id, u.role FROM users u JOIN teams t ON t.id = u.team_id
    WHERE u.id = ? AND t.company_id = ?
  `).bind(id, sa.company_id).first<{ id: string; role: string }>();

  if (!target) return c.json({ error: "Utilisateur introuvable dans ta société." }, 404);

  if (target.role === 'owner') {
    return c.json({ error: "Impossible de révoquer un owner." }, 403);
  }

  if (target.role === 'superadmin') {
    // Un owner hérite du rôle superadmin → il compte comme superadmin restant (anti-lockout).
    const rolePlaceholders = SUPERADMIN_ROLES.map(() => '?').join(',');
    const others = await c.env.DB.prepare(`
      SELECT COUNT(*) as n FROM users u JOIN teams t ON t.id = u.team_id
      WHERE t.company_id = ? AND u.role IN (${rolePlaceholders}) AND u.active = 1 AND u.id != ?
    `).bind(sa.company_id, ...SUPERADMIN_ROLES, id).first<{ n: number }>();
    if ((others?.n ?? 0) === 0) {
      return c.json({ error: "Impossible : c'est le dernier superadmin de la société." }, 400);
    }
  }

  await c.env.DB.prepare("UPDATE users SET role = 'member' WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

app.get('/api/push/vapid-key', async (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null });
});

const PUSH_SERVICE_DOMAINS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
const MAX_PUSH_ENDPOINT_LENGTH = 2048;
const MAX_PUSH_KEY_LENGTH = 256;

function isKnownPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:'
      && PUSH_SERVICE_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isPushKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PUSH_KEY_LENGTH;
}

app.post('/api/push/subscribe', requireUser, async (c) => {
  const me = c.get('user');
  const { endpoint, keys } = await c.req.json();
  if (!isKnownPushEndpoint(endpoint) || !isPushKey(keys?.p256dh) || !isPushKey(keys?.auth)) {
    return c.json({ error: 'Abonnement push invalide' }, 400);
  }
  await c.env.DB.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
  `).bind(me.id, endpoint, keys.p256dh, keys.auth).run();

  return c.json({ success: true });
});

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [provided, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))),
  );
  return crypto.subtle.timingSafeEqual(a, b);
}

// === Digest hebdomadaire (rétention) ===
// Déclenché par un cron externe (GitHub Actions) via secret. Pages Functions n'a pas de Cron Trigger.
// Envoie à chaque membre (ayant un email) le résumé de la semaine de son équipe. ?dry=1 = simulation sans envoi.
app.post('/api/cron/weekly-digest', async (c) => {
  const header = c.req.header('Authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!c.env.CRON_SECRET || !(await secretsMatch(provided, c.env.CRON_SECRET))) {
    return c.json({ error: 'Non autorisé' }, 401);
  }
  const dryRun = c.req.query('dry') === '1';
  const baseUrl = appBaseUrl(c);
  const MAX_EMAILS = 200;

  const teamsRes = await c.env.DB.prepare(`
    SELECT t.id, t.name AS team_name FROM teams t
    JOIN companies co ON co.id = t.company_id
    WHERE t.active = 1 AND co.active = 1
  `).all<{ id: string; team_name: string }>();

  let teamsWithActivity = 0;
  let emailsSent = 0;
  let processed = 0;
  const preview: any[] = [];

  for (const team of (teamsRes.results || [])) {
    const wp = await c.env.DB.prepare(`
      SELECT p.to_user_id, p.category_id, c.name AS cat_name, c.emoji, u.name AS to_name
      FROM points_log p
      JOIN categories c ON c.id = p.category_id
      JOIN users u ON u.id = p.to_user_id
      WHERE p.team_id = ? AND p.created_at >= datetime('now', '-7 days')
    `).bind(team.id).all<{ to_user_id: string; category_id: string; cat_name: string; emoji: string; to_name: string }>();

    const rows = wp.results || [];
    if (rows.length === 0) continue; // pas d'activité → pas de mail (anti-spam)
    teamsWithActivity++;

    const total = rows.length;
    const perUser = new Map<string, { name: string; count: number }>();
    const perCat = new Map<string, { name: string; emoji: string; count: number }>();
    for (const r of rows) {
      const u = perUser.get(r.to_user_id) || { name: r.to_name, count: 0 };
      u.count++; perUser.set(r.to_user_id, u);
      const cat = perCat.get(r.category_id) || { name: r.cat_name, emoji: r.emoji, count: 0 };
      cat.count++; perCat.set(r.category_id, cat);
    }
    const topUser = [...perUser.values()].sort((a, b) => b.count - a.count)[0] || null;
    const topCat = [...perCat.values()].sort((a, b) => b.count - a.count)[0] || null;

    const gagesRes = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM dare_log WHERE team_id = ? AND cleared_at >= datetime('now', '-7 days')"
    ).bind(team.id).first<{ n: number }>();
    const gages = gagesRes?.n || 0;

    const membersRes = await c.env.DB.prepare(
      "SELECT id, name, email, locale FROM users WHERE team_id = ? AND active = 1 AND email_verified = 1 AND email IS NOT NULL AND email != ''"
    ).bind(team.id).all<{ id: string; name: string; email: string; locale: string | null }>();

    for (const m of (membersRes.results || [])) {
      if (processed >= MAX_EMAILS) break;
      processed++;
      const myReceived = perUser.get(m.id)?.count || 0;
      const { subject, html } = buildDigestEmail({
        baseUrl, isEn: m.locale === 'en', memberName: m.name, teamName: team.team_name,
        total, topUser, topCat, gages, myReceived,
      });
      if (dryRun) {
        preview.push({ team: team.team_name, to: m.email, myReceived, subject });
      } else {
        await sendEmail(c.env, m.email, subject, html);
        emailsSent++;
      }
    }
  }

  return c.json({
    ok: true,
    dryRun,
    teamsWithActivity,
    emailsSent: dryRun ? 0 : emailsSent,
    ...(dryRun ? { wouldSend: preview.length, preview } : {}),
  });
});

// === Open Graph : injection des meta selon Accept-Language ===

async function serveHtmlWithOg(c: AppContext, page: OgPage, assetPath?: string): Promise<Response> {
  const request = assetPath
    ? new Request(new URL(assetPath, c.req.url).toString(), { method: 'GET', headers: c.req.raw.headers })
    : c.req.raw;
  const asset = await c.env.ASSETS.fetch(request);
  if (!(asset.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) return asset;

  const og = ogDataFor(page, languageFromAcceptLanguage(c.req.header('Accept-Language')));
  return new Response(fillOgPlaceholders(await asset.text(), og, new URL(c.req.url).origin), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': asset.headers.get('Cache-Control') || 'public, max-age=0, must-revalidate',
    },
  });
}

app.get('/', (c) => serveHtmlWithOg(c, '/'));
app.get('/about', (c) => serveHtmlWithOg(c, '/about'));
app.get('/about.html', (c) => serveHtmlWithOg(c, '/about'));
// Lien d'invitation : sert l'app (index) pour que le frontend rende l'écran "Rejoindre".
app.get('/join/:code', (c) => serveHtmlWithOg(c, '/', '/'));

const ALWAYS_REVALIDATED_ASSET = /\.(js|css)$/;

app.get('/*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  if (!ALWAYS_REVALIDATED_ASSET.test(c.req.path)) return response;
  const revalidated = new Response(response.body, response);
  revalidated.headers.set('Cache-Control', 'no-cache');
  return revalidated;
});

export default app;

