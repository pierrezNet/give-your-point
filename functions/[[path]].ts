import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { streamSSE } from 'hono/streaming'

type Bindings = {
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

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Code d'invitation opaque et partageable pour une équipe (16 hex).
function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
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

// Construit le mail de digest hebdomadaire (fr/en). Les valeurs dynamiques sont échappées.
function buildDigestEmail(opts: {
  baseUrl: string; isEn: boolean; memberName: string; teamName: string;
  total: number; topUser: { name: string; count: number } | null;
  topCat: { name: string; emoji: string; count: number } | null;
  gages: number; myReceived: number;
}): { subject: string; html: string } {
  const { baseUrl, isEn, total, gages, myReceived } = opts;
  const memberName = escapeHtml(opts.memberName);
  const teamName = escapeHtml(opts.teamName);
  const topUser = opts.topUser ? { name: escapeHtml(opts.topUser.name), count: opts.topUser.count } : null;
  const topCat = opts.topCat ? { name: escapeHtml(opts.topCat.name), emoji: opts.topCat.emoji, count: opts.topCat.count } : null;

  if (isEn) {
    return {
      subject: `📊 Your week on Give Your Point — ${teamName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e293b">Hi ${memberName}, here's ${teamName}'s week 📊</h2>
          <ul style="color:#334155;font-size:15px;line-height:1.9;list-style:none;padding:0">
            <li>🎯 <b>${total}</b> point(s) given this week</li>
            ${topUser ? `<li>🏆 In the lead: <b>${topUser.name}</b> (${topUser.count})</li>` : ''}
            ${topCat ? `<li>${topCat.emoji} Favourite badge: <b>${topCat.name}</b> (${topCat.count})</li>` : ''}
            ${gages > 0 ? `<li>🚨 <b>${gages}</b> dare(s) triggered</li>` : ''}
            <li>👉 You received <b>${myReceived}</b> point(s) this week</li>
          </ul>
          <p style="margin-top:24px">
            <a href="${baseUrl}" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open Give Your Point</a>
          </p>
          <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
            📭 This mailbox is not monitored — please don't reply.<br>
            You receive this weekly summary because your email is linked to your account. To stop, ask an admin to remove your email.
          </p>
        </div>`,
    };
  }
  return {
    subject: `📊 Ta semaine sur Donne Ton Point — ${teamName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1e293b">Salut ${memberName}, voici la semaine de ${teamName} 📊</h2>
        <ul style="color:#334155;font-size:15px;line-height:1.9;list-style:none;padding:0">
          <li>🎯 <b>${total}</b> point(s) distribué(s) cette semaine</li>
          ${topUser ? `<li>🏆 En tête : <b>${topUser.name}</b> (${topUser.count})</li>` : ''}
          ${topCat ? `<li>${topCat.emoji} Badge favori : <b>${topCat.name}</b> (${topCat.count})</li>` : ''}
          ${gages > 0 ? `<li>🚨 <b>${gages}</b> gage(s) déclenché(s)</li>` : ''}
          <li>👉 Toi : tu as reçu <b>${myReceived}</b> point(s) cette semaine</li>
        </ul>
        <p style="margin-top:24px">
          <a href="${baseUrl}" style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Ouvrir Donne Ton Point</a>
        </p>
        <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
          📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.<br>
          Tu reçois ce résumé hebdo car ton email est associé à ton compte. Pour ne plus le recevoir, demande à un admin de retirer ton email.
        </p>
      </div>`,
  };
}

async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
  if (!token || !secret) {
    console.log('[turnstile] missing input', { hasToken: !!token, tokenLen: token?.length, hasSecret: !!secret });
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
      console.log('[turnstile] rejected', { 'error-codes': data['error-codes'], hostname: data.hostname, action: data.action, ip });
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
  role: string
  active: number
  team_id: string
  team_name: string
  company_id: string
  company_name: string
  email: string | null
  locale: string | null
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

interface DareRule {
  id: string;
  category_id: string;
  threshold: number;
  dare_text: string;
}

interface PointStat {
  to_user_id: string;
  category_id: string;
  total: number;
}

async function getUserByToken(db: D1Database, token: string): Promise<AuthUser | null> {
  return db.prepare(`
    SELECT u.id, u.name, u.role, u.active, u.team_id, u.email, u.locale,
           t.name AS team_name, t.company_id,
           c.name AS company_name
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    LEFT JOIN companies c ON c.id = t.company_id
    WHERE u.token = ? AND u.active = 1
  `).bind(token).first<AuthUser>();
}

function extractToken(c: any): string | null {
  const header = c.req.header('Authorization');
  if (header) return header.replace('Bearer ', '');
  // Pour SSE/EventSource qui n'accepte pas les headers custom
  return c.req.query('t') || null;
}

const requireUser = async (c: any, next: any) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: 'Non autorisé' }, 401);
  const user = await getUserByToken(c.env.DB, token);
  if (!user) return c.json({ error: 'Session invalide' }, 401);
  c.set('user', user);
  await next();
};

const ADMIN_ROLES = ['admin', 'superadmin', 'owner'];
const SUPERADMIN_ROLES = ['superadmin', 'owner'];

const requireAdmin = async (c: any, next: any) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: 'Non autorisé' }, 401);
  const user = await getUserByToken(c.env.DB, token);
  if (!user) return c.json({ error: 'Session invalide' }, 401);
  if (!ADMIN_ROLES.includes(user.role)) return c.json({ error: 'Accès admin requis' }, 403);
  c.set('user', user);
  await next();
};

const requireSuperadmin = async (c: any, next: any) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: 'Non autorisé' }, 401);
  const user = await getUserByToken(c.env.DB, token);
  if (!user) return c.json({ error: 'Session invalide' }, 401);
  if (!SUPERADMIN_ROLES.includes(user.role)) return c.json({ error: 'Accès superadmin requis' }, 403);
  c.set('user', user);
  await next();
};

const requireOwner = async (c: any, next: any) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: 'Non autorisé' }, 401);
  const user = await getUserByToken(c.env.DB, token);
  if (!user) return c.json({ error: 'Session invalide' }, 401);
  if (user.role !== 'owner') return c.json({ error: 'Accès owner requis' }, 403);
  c.set('user', user);
  await next();
};

async function getUsersStats(db: D1Database, teamId: string) {
  const [catRes, statsRes, rulesRes, usersRes] = await Promise.all([
    db.prepare("SELECT id, name, emoji FROM categories WHERE team_id = ?").bind(teamId).all(),
    db.prepare("SELECT to_user_id, category_id, COUNT(*) as total FROM points_log WHERE team_id = ? GROUP BY to_user_id, category_id").bind(teamId).all<PointStat>(),
    db.prepare("SELECT * FROM dare_rules WHERE team_id = ?").bind(teamId).all<DareRule>(),
    db.prepare("SELECT id, name FROM users WHERE active = 1 AND team_id = ?").bind(teamId).all()
  ]);

  const catMap = new Map((catRes.results || []).map((cat: any) => [cat.id, cat]));
  const stats = statsRes.results || [];
  const rules = rulesRes.results || [];
  const users = usersRes.results || [];

  const data = users.map((user: any) => {
    const userPoints = stats.filter(p => p.to_user_id === user.id);
    const total_points = userPoints.reduce((sum, p) => sum + p.total, 0);

    const topCategories = userPoints
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(p => {
        const category: any = catMap.get(p.category_id);
        return { count: p.total, emoji: category?.emoji || '✨', cat_name: category?.name || 'Inconnu' };
      });

    let activeDare = null;
    for (const rule of rules) {
      const score = userPoints.find(p => p.category_id === rule.category_id);
      if (score && score.total >= rule.threshold) { activeDare = rule.dare_text; break; }
    }

    return { ...user, total_points, topCategories, gage: activeDare };
  });

  return data.sort((a: any, b: any) => b.total_points - a.total_points)
             .map((u: any, index: number) => ({ ...u, rank: index + 1 }));
}

// === Push Notification Helpers (Web Crypto API, no npm needed) ===

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeb64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=');
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

async function encryptPushPayload(payload: string, p256dhB64url: string, authB64url: string): Promise<ArrayBuffer> {
  const te = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const receiverPubRaw = decodeb64url(p256dhB64url);
  const receiverKey = await crypto.subtle.importKey('raw', receiverPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  const senderPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const senderPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderPair.publicKey) as ArrayBuffer);

  const ecdhBits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey } as any, senderPair.privateKey, 256));

  // RFC 8291 key derivation
  const authSecret = decodeb64url(authB64url);
  const prk = await hmacSha256(authSecret, ecdhBits);
  const ikm = await hmacSha256(prk, concatBytes(te.encode('WebPush: info\x00'), receiverPubRaw, senderPubRaw, new Uint8Array([1])));

  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\x00'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    concatBytes(te.encode(payload), new Uint8Array([2])) // payload + padding delimiter
  ));

  // RFC 8291 binary body: salt(16) | rs(4) | idlen(1) | sender_pub(65) | ciphertext
  const header = new Uint8Array(21 + senderPubRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = senderPubRaw.length;
  header.set(senderPubRaw, 21);
  return concatBytes(header, ciphertext).buffer as ArrayBuffer;
}

async function vapidJwt(endpoint: string, subject: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const te = new TextEncoder();
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(te.encode(JSON.stringify({ aud, exp, sub: subject })));
  const sigInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey('jwk', privateKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(sigInput));
  return `${sigInput}.${b64url(sig)}`;
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
    await c.env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(cleanEmail, u.id).run();
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

// Enregistrer un point
app.post('/api/points', requireUser, async (c) => {
  try {
    const body = await c.req.json();
    const { to_user_id, category_id } = body;
    const fromUser = c.get('user');

    if (fromUser.id === to_user_id) {
      return c.json({ error: "Interdit de s'auto-mousser ! 😅" }, 400);
    }

    // Vérifier que le destinataire est dans la même équipe
    const toUser = await c.env.DB.prepare(
      "SELECT id, name, team_id, active, email, locale FROM users WHERE id = ?"
    ).bind(to_user_id).first<{ id: string; name: string; team_id: string; active: number; email: string | null; locale: string | null }>();

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

    // Anti-doublon : même badge au même collègue dans les 5 dernières minutes
    const recentDupe = await c.env.DB.prepare(`
      SELECT 1 FROM points_log
      WHERE from_user_id = ? AND to_user_id = ? AND category_id = ?
      AND created_at >= datetime('now', '-5 minutes')
    `).bind(fromUser.id, to_user_id, category_id).first();

    if (recentDupe) {
      return c.json({ error: "Tu viens déjà d'offrir ce badge à cette personne ! 😄" }, 429);
    }

    // Limite : 10 points donnés par jour
    const todayCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM points_log WHERE from_user_id = ? AND created_at >= date('now')"
    ).bind(fromUser.id).first<{ count: number }>();

    if ((todayCount?.count ?? 0) >= 10) {
      return c.json({ error: "Tu as distribué tes 10 points du jour ! Reviens demain 🌙" }, 429);
    }

    await c.env.DB.prepare(
      'INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
    )
    .bind(fromUser.team_id, fromUser.id, to_user_id, category_id)
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

    const newCount = newCountRes?.count ?? 0;
    const toName = toUser.name;
    let gageTriggered = null;
    let gageWarning = null;

    for (const rule of (rulesRes.results ?? [])) {
      if (newCount === rule.threshold) {
        gageTriggered = { name: toName, dare: rule.dare_text };
        break;
      }
      if (newCount === rule.threshold - 1) {
        gageWarning = { name: toName };
        break;
      }
    }

    // Notification push non-bloquante
    c.executionCtx.waitUntil(
      sendPushToUser(c.env, to_user_id, fromUser.name, category_id).catch(() => {})
    );

    // Notification email non-bloquante (si destinataire a un email renseigné)
    if (toUser.email) {
      const isEn = toUser.locale === 'en';
      const subject = isEn
        ? `🎯 ${fromUser.name} gave you a point!`
        : `🎯 ${fromUser.name} t'a donné un point !`;
      const html = isEn ? `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e293b">Hi ${toUser.name},</h2>
          <p style="color:#334155;font-size:15px">
            <b>${fromUser.name}</b> just gave you a point for
            <b>${cat.emoji} ${cat.name}</b>.
          </p>
          <p style="margin-top:24px">
            <a href="https://compteur.pierrez.net/"
               style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">
              See on Give Your Point
            </a>
          </p>
          <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
            📭 This mailbox is not monitored — please don't reply.<br>
            You receive this message because your email is linked to your account.
            To unsubscribe, ask an admin to remove your email.
          </p>
        </div>` : `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#1e293b">Bonjour ${toUser.name},</h2>
          <p style="color:#334155;font-size:15px">
            <b>${fromUser.name}</b> vient de t'offrir un point pour
            <b>${cat.emoji} ${cat.name}</b>.
          </p>
          <p style="margin-top:24px">
            <a href="https://compteur.pierrez.net/"
               style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">
              Voir sur Donne Ton Point
            </a>
          </p>
          <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
            📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.<br>
            Tu reçois ce mail parce que ton email est associé à ton compte.
            Pour ne plus en recevoir, demande à un admin de retirer ton email.
          </p>
        </div>`;
      c.executionCtx.waitUntil(sendEmail(c.env, toUser.email, subject, html));
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
    return c.json({ error: "Erreur calcul stats", details: e.message }, 500);
  }
});

app.get('/api/stats', requireUser, async (c) => {
  const u = c.get('user');
  const teamId = u.team_id;

  const [giversRes, receiversRes, catsRes, matrixRes, evolutionRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT u.name, COUNT(*) as total
      FROM points_log p JOIN users u ON p.from_user_id = u.id
      WHERE u.active = 1 AND p.team_id = ?
      GROUP BY p.from_user_id ORDER BY total DESC LIMIT 10
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT u.name, COUNT(*) as total
      FROM points_log p JOIN users u ON p.to_user_id = u.id
      WHERE u.active = 1 AND p.team_id = ?
      GROUP BY p.to_user_id ORDER BY total DESC LIMIT 10
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT c.name, c.emoji, COUNT(*) as total
      FROM points_log p JOIN categories c ON p.category_id = c.id
      WHERE p.team_id = ?
      GROUP BY p.category_id ORDER BY total DESC
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT u_from.name as from_name, u_to.name as to_name, COUNT(*) as total
      FROM points_log p
      JOIN users u_from ON p.from_user_id = u_from.id
      JOIN users u_to ON p.to_user_id = u_to.id
      WHERE u_from.active = 1 AND u_to.active = 1 AND p.team_id = ?
      GROUP BY p.from_user_id, p.to_user_id
    `).bind(teamId).all(),
    c.env.DB.prepare(`
      SELECT strftime('%Y-%W', created_at) as week, COUNT(*) as total
      FROM points_log WHERE team_id = ?
      GROUP BY week ORDER BY week DESC LIMIT 12
    `).bind(teamId).all(),
  ]);

  const receivers = receiversRes.results || [];
  const totalPoints = receivers.reduce((sum: number, u: any) => sum + u.total, 0);

  return c.json({
    totalPoints,
    givers: giversRes.results || [],
    receivers,
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

app.post('/api/track', async (c) => {
  try {
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

    const company = (company_name || '').trim();
    const admin = (admin_name || '').trim();
    const emailRaw = (admin_email || '').trim();
    const email = emailRaw && isValidEmail(emailRaw) ? emailRaw : null;
    const userLocale = locale === 'en' ? 'en' : 'fr';

    if (!company || company.length < 2 || company.length > 60) {
      return c.json({ error: "Nom de société requis (2 à 60 caractères)" }, 400);
    }
    if (!admin || admin.length < 1 || admin.length > 40) {
      return c.json({ error: "Prénom requis (1 à 40 caractères)" }, 400);
    }

    const ip = c.req.header('CF-Connecting-IP') || undefined;
    const ok = await verifyTurnstile(turnstile_token, c.env.TURNSTILE_SECRET_KEY, ip);
    if (!ok) {
      return c.json({ error: "Vérification anti-bot échouée. Réessaie." }, 403);
    }

    const companyId = crypto.randomUUID();
    const teamId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const inviteCode = generateInviteCode();
    const categories = defaultCategoriesFor(userLocale);

    const statements = [
      c.env.DB.prepare("INSERT INTO companies (id, name, active) VALUES (?, ?, 1)").bind(companyId, company),
      c.env.DB.prepare("INSERT INTO teams (id, company_id, name, active, invite_code) VALUES (?, ?, ?, 1, ?)").bind(teamId, companyId, company, inviteCode),
      c.env.DB.prepare("INSERT INTO users (id, team_id, name, role, active, token, email, locale) VALUES (?, ?, ?, 'superadmin', 1, ?, ?, ?)").bind(userId, teamId, admin, userId, email, userLocale),
      ...categories.map(cat =>
        c.env.DB.prepare("INSERT INTO categories (id, team_id, name, emoji, forfeit, active) VALUES (?, ?, ?, ?, ?, 1)")
          .bind(crypto.randomUUID(), teamId, cat.name, cat.emoji, cat.forfeit)
      ),
    ];

    await c.env.DB.batch(statements);

    return c.json({ success: true, token: userId });
  } catch (err: any) {
    console.error("Erreur onboarding:", err);
    return c.json({ error: "Erreur lors de la création de l'espace" }, 500);
  }
});

// Route pour le lien magique : /login/ton-token-unique
app.get('/login/:token', async (c) => {
  const token = c.req.param('token');

  const user = await c.env.DB.prepare(
    'SELECT id, name FROM users WHERE token = ?'
  ).bind(token).first();

  if (!user) {
    return c.html(`
      <div style="font-family:sans-serif; text-align:center; padding:50px;">
        <h1>Oups ! ❌</h1>
        <p>Ce lien n'est plus valide ou l'utilisateur n'existe pas.</p>
        <a href="/">Retour à l'accueil</a>
      </div>
    `, 404);
  }

  return c.redirect(`/?login_id=${user.id}&login_name=${encodeURIComponent(user.name as string)}`);
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

// Le visiteur muni du lien s'ajoute lui-même comme membre (invariant id == token).
app.post('/api/join', async (c) => {
  try {
    const { code, name } = await c.req.json();
    const cleanName = (name || '').trim();
    if (!cleanName || cleanName.length < 1 || cleanName.length > 40) {
      return c.json({ error: "Prénom requis (1 à 40 caractères)" }, 400);
    }
    const team = await c.env.DB.prepare(`
      SELECT t.id FROM teams t JOIN companies c ON c.id = t.company_id
      WHERE t.invite_code = ? AND t.active = 1 AND c.active = 1
    `).bind(code).first<{ id: string }>();
    if (!team) return c.json({ error: "Lien d'invitation invalide ou expiré." }, 404);

    const userId = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO users (id, team_id, name, role, active, token) VALUES (?, ?, ?, 'member', 1, ?)"
    ).bind(userId, team.id, cleanName, userId).run();
    return c.json({ success: true, token: userId });
  } catch (err) {
    console.error("Erreur join:", err);
    return c.json({ error: "Erreur lors de l'inscription" }, 500);
  }
});

// === Routes admin (scope = équipe de l'admin) ===

app.get('/api/admin/users', requireAdmin, async (c) => {
  const admin = c.get('user');
  const users = await c.env.DB.prepare(
    "SELECT * FROM users WHERE team_id = ? ORDER BY active DESC, name ASC"
  ).bind(admin.team_id).all();
  return c.json(users.results);
});

app.patch('/api/admin/users/:id/restore', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE users SET active = 1 WHERE id = ? AND team_id = ?"
  ).bind(id, admin.team_id).run();
  return c.json({ success: true });
});

app.post('/api/admin/users', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { name, email } = await c.req.json();
  const id = crypto.randomUUID();
  const emailRaw = (email || '').trim();
  const cleanEmail = emailRaw && isValidEmail(emailRaw) ? emailRaw : null;
  await c.env.DB.prepare(
    "INSERT INTO users (id, team_id, name, role, active, token, email) VALUES (?, ?, ?, 'member', 1, ?, ?)"
  ).bind(id, admin.team_id, name, id, cleanEmail).run();
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
  const origin = new URL(c.req.url).origin;
  return c.json({ code, url: `${origin}/join/${code}`, team_name: admin.team_name });
});

// Envoyer le lien d'invitation par email (réutilise Resend).
app.post('/api/admin/invite', requireAdmin, async (c) => {
  const admin = c.get('user');
  const { email } = await c.req.json();
  const clean = (email || '').trim();
  if (!clean || !isValidEmail(clean)) return c.json({ error: "Email invalide" }, 400);

  const code = await getOrCreateInviteCode(c.env.DB, admin.team_id);
  const joinUrl = `${new URL(c.req.url).origin}/join/${code}`;
  const isEn = admin.locale === 'en';
  const subject = isEn
    ? `${admin.name} invites you to ${admin.team_name} on Give Your Point`
    : `${admin.name} t'invite à rejoindre ${admin.team_name} sur Donne Ton Point`;
  const html = isEn ? `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1e293b">You're invited! 🎯</h2>
      <p style="color:#334155;font-size:15px">
        <b>${admin.name}</b> invites you to join the team
        <b>${admin.team_name}</b> on Give Your Point.
      </p>
      <p style="margin-top:24px">
        <a href="${joinUrl}"
           style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">
          Join the team
        </a>
      </p>
      <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
        📭 This mailbox is not monitored — please don't reply.
      </p>
    </div>` : `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1e293b">Tu es invité·e ! 🎯</h2>
      <p style="color:#334155;font-size:15px">
        <b>${admin.name}</b> t'invite à rejoindre l'équipe
        <b>${admin.team_name}</b> sur Donne Ton Point.
      </p>
      <p style="margin-top:24px">
        <a href="${joinUrl}"
           style="background:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">
          Rejoindre l'équipe
        </a>
      </p>
      <p style="color:#94a3b8;font-size:11px;margin-top:32px;line-height:1.6">
        📭 Cette boîte mail n'est pas surveillée — ne réponds pas à ce message.
      </p>
    </div>`;
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

app.delete('/api/admin/users/:id', requireAdmin, async (c) => {
  const admin = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE users SET active = 0 WHERE id = ? AND team_id = ?"
  ).bind(id, admin.team_id).run();
  return c.json({ success: true });
});

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

app.get('/api/admin/dares', requireAdmin, async (c) => {
  const admin = c.get('user');
  const teamId = admin.team_id;
  const [rulesRes, statsRes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM dare_rules WHERE team_id = ?").bind(teamId).all<DareRule>(),
    c.env.DB.prepare(
      "SELECT to_user_id, category_id, COUNT(*) as total FROM points_log WHERE team_id = ? GROUP BY to_user_id, category_id"
    ).bind(teamId).all<PointStat>(),
  ]);

  const rules = rulesRes.results || [];
  const stats = statsRes.results || [];

  const activeDares: { userId: string; categoryId: string; count: number; dare: string }[] = [];
  for (const rule of rules) {
    for (const stat of stats) {
      if (stat.category_id === rule.category_id && stat.total >= rule.threshold) {
        activeDares.push({
          userId: stat.to_user_id,
          categoryId: stat.category_id,
          count: stat.total,
          dare: rule.dare_text,
        });
      }
    }
  }

  return c.json(activeDares);
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
        AND created_at >= datetime('now', '-15 seconds')
        ORDER BY created_at DESC LIMIT 1
    )
  `).bind(me.id).run();

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
  const { results } = await c.env.DB.prepare(`
    SELECT dl.*, u.name as user_name, c.name as cat_name, c.emoji
    FROM dare_log dl
    JOIN users u ON dl.user_id = u.id
    JOIN categories c ON dl.category_id = c.id
    WHERE dl.team_id = ?
    ORDER BY dl.cleared_at DESC
    LIMIT 50
  `).bind(admin.team_id).all();
  return c.json(results);
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
  const { name } = await c.req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return c.json({ error: 'Nom requis' }, 400);
  }
  const id = crypto.randomUUID();
  const inviteCode = generateInviteCode();
  await c.env.DB.prepare(
    "INSERT INTO teams (id, company_id, name, active, invite_code) VALUES (?, ?, ?, 1, ?)"
  ).bind(id, sa.company_id, name.trim(), inviteCode).run();
  return c.json({ success: true, id });
});

// Renommer une équipe
app.patch('/api/superadmin/teams/:id', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const id = c.req.param('id');
  const { name } = await c.req.json();
  if (!name || !name.trim()) return c.json({ error: 'Nom requis' }, 400);
  const result = await c.env.DB.prepare(
    "UPDATE teams SET name = ? WHERE id = ? AND company_id = ?"
  ).bind(name.trim(), id, sa.company_id).run();
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
  if (!name || !name.trim()) return c.json({ error: 'Nom requis' }, 400);
  const userRole = (role === 'admin' || role === 'superadmin') ? role : 'member';
  const emailRaw = (email || '').trim();
  const cleanEmail = emailRaw && isValidEmail(emailRaw) ? emailRaw : null;

  // Vérifier que la team appartient à la société du superadmin
  const team = await c.env.DB.prepare(
    "SELECT id FROM teams WHERE id = ? AND company_id = ?"
  ).bind(teamId, sa.company_id).first();
  if (!team) return c.json({ error: "Équipe introuvable dans ta société" }, 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO users (id, team_id, name, role, active, token, email) VALUES (?, ?, ?, ?, 1, ?, ?)"
  ).bind(id, teamId, name.trim(), userRole, id, cleanEmail).run();
  return c.json({ success: true, id, token: id });
});

// Liste les admins et superadmins de la société (pour gestion + récupération magic link)
app.get('/api/superadmin/admins', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.role, u.token, u.active, u.team_id, t.name AS team_name
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

// Promouvoir un user en admin ou superadmin
app.post('/api/superadmin/users/:id/promote', requireSuperadmin, async (c) => {
  const sa = c.get('user');
  const id = c.req.param('id');
  const { role } = await c.req.json();
  if (role !== 'admin' && role !== 'superadmin') {
    return c.json({ error: "Rôle invalide (admin ou superadmin uniquement)" }, 400);
  }
  // Vérifier que le user cible est dans la société du superadmin
  const target = await c.env.DB.prepare(`
    SELECT u.id FROM users u JOIN teams t ON t.id = u.team_id
    WHERE u.id = ? AND t.company_id = ?
  `).bind(id, sa.company_id).first();
  if (!target) return c.json({ error: "Utilisateur introuvable dans ta société." }, 404);

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
    const others = await c.env.DB.prepare(`
      SELECT COUNT(*) as n FROM users u JOIN teams t ON t.id = u.team_id
      WHERE t.company_id = ? AND u.role = 'superadmin' AND u.active = 1 AND u.id != ?
    `).bind(sa.company_id, id).first<{ n: number }>();
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

app.post('/api/push/subscribe', requireUser, async (c) => {
  const me = c.get('user');
  const { endpoint, keys } = await c.req.json();
  await c.env.DB.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
  `).bind(me.id, endpoint, keys.p256dh, keys.auth).run();

  return c.json({ success: true });
});

// === Digest hebdomadaire (rétention) ===
// Déclenché par un cron externe (GitHub Actions) via secret. Pages Functions n'a pas de Cron Trigger.
// Envoie à chaque membre (ayant un email) le résumé de la semaine de son équipe. ?dry=1 = simulation sans envoi.
app.post('/api/cron/weekly-digest', async (c) => {
  const provided = (c.req.header('Authorization') || '').replace('Bearer ', '') || c.req.query('secret') || '';
  if (!c.env.CRON_SECRET || provided !== c.env.CRON_SECRET) {
    return c.json({ error: 'Non autorisé' }, 401);
  }
  const dryRun = c.req.query('dry') === '1';
  const baseUrl = new URL(c.req.url).origin;
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
      "SELECT id, name, email, locale FROM users WHERE team_id = ? AND active = 1 AND email IS NOT NULL AND email != ''"
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

const OG_DATA: Record<string, Record<'fr' | 'en', { title: string; desc: string; locale: string }>> = {
  '/': {
    fr: {
      title: "Donne Ton Point — Le rituel d'équipe",
      desc: "Récompense les bons coups (et les bourdes) de ton équipe avec des badges. Quand un seuil est atteint, c'est gage !",
      locale: 'fr_FR',
    },
    en: {
      title: 'Give Your Point — The team ritual',
      desc: 'Reward the wins (and the goofs) of your team with badges. When a threshold is reached, time for a dare!',
      locale: 'en_US',
    },
  },
  '/about': {
    fr: {
      title: "À propos — Donne Ton Point",
      desc: "Présentation, modèle de rôles, politique RGPD et contact.",
      locale: 'fr_FR',
    },
    en: {
      title: 'About — Give Your Point',
      desc: 'Presentation, roles model, GDPR policy and contact.',
      locale: 'en_US',
    },
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function serveHtmlWithOg(c: any, key: string, assetPath?: string): Promise<Response> {
  // assetPath permet de servir un autre asset que l'URL demandée (ex : /join/:code → index).
  const req = assetPath
    ? new Request(new URL(assetPath, c.req.url).toString(), { method: 'GET', headers: c.req.raw.headers })
    : c.req.raw;
  const resp = await c.env.ASSETS.fetch(req);
  const ct = resp.headers.get('Content-Type') || '';
  if (!ct.toLowerCase().includes('text/html')) {
    return resp;
  }
  const acceptLang = (c.req.header('Accept-Language') || '').toLowerCase();
  const lang: 'fr' | 'en' = acceptLang.startsWith('en') ? 'en' : 'fr';
  const data = OG_DATA[key]?.[lang] || OG_DATA[key]?.fr || OG_DATA['/'].fr;
  const url = new URL(c.req.url);
  const html = await resp.text();
  const replaced = html
    .replace(/\{\{OG_TITLE\}\}/g, escapeHtml(data.title))
    .replace(/\{\{OG_DESC\}\}/g, escapeHtml(data.desc))
    .replace(/\{\{OG_URL\}\}/g, escapeHtml(url.origin))
    .replace(/\{\{OG_LOCALE\}\}/g, data.locale);
  return new Response(replaced, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': resp.headers.get('Cache-Control') || 'public, max-age=0, must-revalidate',
    },
  });
}

app.get('/', (c) => serveHtmlWithOg(c, '/'));
app.get('/about', (c) => serveHtmlWithOg(c, '/about'));
app.get('/about.html', (c) => serveHtmlWithOg(c, '/about'));
// Lien d'invitation : sert l'app (index) pour que le frontend rende l'écran "Rejoindre".
app.get('/join/:code', (c) => serveHtmlWithOg(c, '/', '/'));

app.get('/*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export const onRequest = handle(app);
