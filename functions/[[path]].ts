import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { streamSSE } from 'hono/streaming'

type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY_JWK: string
  VAPID_SUBJECT: string
}

const app = new Hono<{ Bindings: Bindings }>()

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

async function getUsersStats(db: D1Database) {
  const [catRes, statsRes, rulesRes, usersRes] = await Promise.all([
    db.prepare("SELECT id, name, emoji FROM categories").all(),
    db.prepare("SELECT to_user_id, category_id, COUNT(*) as total FROM points_log GROUP BY to_user_id, category_id").all<PointStat>(),
    db.prepare("SELECT * FROM dare_rules").all<DareRule>(),
    db.prepare("SELECT id, name FROM users WHERE active = 1").all()
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

app.get('/api/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return c.json({ error: 'No token' }, 401);

  const user = await c.env.DB.prepare("SELECT id, name FROM users WHERE token = ?")
    .bind(token)
    .first();

  if (!user) return c.json({ error: 'Invalid token' }, 401);

  return c.json(user);
});

// Route pour les données des utilisateurs (sans token)
app.get('/api/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name, active FROM users').all()
  return c.json(results)
})

// Route pour récupérer les catégories
app.get('/api/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM categories WHERE active = 1').all();
  return c.json(results);
});

// Route pour enregistrer un point
app.post('/api/points', async (c) => {
  try {
    const body = await c.req.json();
    const { to_user_id, category_id } = body;

    const authHeader = c.req.header('Authorization');
    const fromUserId = authHeader?.replace('Bearer ', '');

    // Sécurité : on vérifie que l'ID n'est pas vide avant de bind
    if (!fromUserId) {
        return c.json({ error: "Session manquante" }, 401);
    }

    // On cherche par ID
    const fromUser = await c.env.DB.prepare("SELECT id, name, active FROM users WHERE id = ?")
      .bind(fromUserId)
      .first<{ id: string, name: string, active: number }>();

    if (!fromUser) {
      return c.json({ error: "Utilisateur non reconnu" }, 401);
    }

    if (fromUser.active !== 1) {
      return c.json({ error: "Ton compte est désactivé, tu ne peux plus donner de points. 🛑" }, 403);
    }

    if (fromUser.id === to_user_id) {
      return c.json({ error: "Interdit de s'auto-mousser ! 😅" }, 400);
    }

    // Limite : 10 points donnés par jour
    const todayCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM points_log WHERE from_user_id = ? AND created_at >= date('now')"
    ).bind(fromUser.id).first<{ count: number }>();

    if ((todayCount?.count ?? 0) >= 10) {
      return c.json({ error: "Tu as distribué tes 10 points du jour ! Reviens demain 🌙" }, 429);
    }

    await c.env.DB.prepare(
      'INSERT INTO points_log (from_user_id, to_user_id, category_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
    )
    .bind(fromUser.id, to_user_id, category_id)
    .run();

    // Notification push non-bloquante
    c.executionCtx.waitUntil(
      sendPushToUser(c.env, to_user_id, fromUser.name, category_id).catch(() => {})
    );

    return c.json({ success: true });

  } catch (err) {
    console.error("Erreur D1:", err);
    return c.json({ success: false, error: "Erreur serveur" }, 500);
  }
});

app.get('/api/users-stats', async (c) => {
  try {
    return c.json(await getUsersStats(c.env.DB));
  } catch (e: any) {
    console.error("🔥 Erreur Stats:", e.message);
    return c.json({ error: "Erreur calcul stats", details: e.message }, 500);
  }
});

app.get('/api/stats', async (c) => {
  const [giversRes, receiversRes, catsRes, matrixRes, evolutionRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT u.name, COUNT(*) as total
      FROM points_log p JOIN users u ON p.from_user_id = u.id
      WHERE u.active = 1 GROUP BY p.from_user_id ORDER BY total DESC LIMIT 10
    `).all(),
    c.env.DB.prepare(`
      SELECT u.name, COUNT(*) as total
      FROM points_log p JOIN users u ON p.to_user_id = u.id
      WHERE u.active = 1 GROUP BY p.to_user_id ORDER BY total DESC LIMIT 10
    `).all(),
    c.env.DB.prepare(`
      SELECT c.name, c.emoji, COUNT(*) as total
      FROM points_log p JOIN categories c ON p.category_id = c.id
      GROUP BY p.category_id ORDER BY total DESC
    `).all(),
    c.env.DB.prepare(`
      SELECT u_from.name as from_name, u_to.name as to_name, COUNT(*) as total
      FROM points_log p
      JOIN users u_from ON p.from_user_id = u_from.id
      JOIN users u_to ON p.to_user_id = u_to.id
      WHERE u_from.active = 1 AND u_to.active = 1
      GROUP BY p.from_user_id, p.to_user_id
    `).all(),
    c.env.DB.prepare(`
      SELECT strftime('%Y-%W', created_at) as week, COUNT(*) as total
      FROM points_log GROUP BY week ORDER BY week DESC LIMIT 12
    `).all(),
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

app.get('/api/events', async (c) => {
  return streamSSE(c, async (stream) => {
    const send = async () => {
      const data = await getUsersStats(c.env.DB);
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

  // On redirige vers l'accueil avec les infos en paramètres d'URL
  // Le Frontend les récupérera et les stockera
  return c.redirect(`/?login_id=${user.id}&login_name=${encodeURIComponent(user.name as string)}`);
});

// 1. Définition du middleware (Le Gardien)
const isAdmin = async (c: any, next: any) => {
  const clientPass = c.req.header('X-Admin-Password');
  const serverPass = c.env.ADMIN_PASSWORD;
  // Sécurité : si le serveur n'a pas de pass défini, on bloque tout par défaut
  if (!serverPass || !clientPass || clientPass !== serverPass) {
    return c.json({ error: 'Accès non autorisé' }, 401);
  }
  await next();
};

// 2. Routes d'administration PROTÉGÉES (Une seule fois !)
app.get('/api/admin/users', isAdmin, async (c) => {
  const users = await c.env.DB.prepare("SELECT * FROM users ORDER BY active DESC, name ASC").all();
  return c.json(users.results);
});

// Réactiver un utilisateur
app.patch('/api/admin/users/:id/restore', isAdmin, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare("UPDATE users SET active = 1 WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

app.post('/api/admin/users', isAdmin, async (c) => {
  const { name } = await c.req.json();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO users (id, name, token) VALUES (?, ?, ?)")
    .bind(id, name, token).run();
  return c.json({ success: true });
});

// Route pour les catégories (protégée aussi)
app.post('/api/admin/categories', isAdmin, async (c) => {
  const { name, emoji } = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO categories (id, name, emoji) VALUES (?, ?, ?)")
    .bind(id, name, emoji).run();
  return c.json({ success: true });
});

// Supprimer un utilisateur
app.delete('/api/admin/users/:id', isAdmin, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare("UPDATE users SET active = 0 WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// Lister les catégories pour l'admin
app.get('/api/admin/categories', isAdmin, async (c) => {
  const cats = await c.env.DB.prepare("SELECT * FROM categories").all();
  return c.json(cats.results);
});

// Désactiver une catégorie (Soft Delete)
app.delete('/api/admin/categories/:id', isAdmin, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare("UPDATE categories SET active = 0 WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// Réactiver une catégorie
app.patch('/api/admin/categories/:id/restore', isAdmin, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare("UPDATE categories SET active = 1 WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// Lister les gages actifs (utilisateurs ayant dépassé un seuil)
app.get('/api/admin/dares', isAdmin, async (c) => {
  const [rulesRes, statsRes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM dare_rules").all<DareRule>(),
    c.env.DB.prepare("SELECT to_user_id, category_id, COUNT(*) as total FROM points_log GROUP BY to_user_id, category_id").all<PointStat>(),
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

// Lister les règles avec le nom de la catégorie (JOIN)
app.get('/api/admin/rules', isAdmin, async (c) => {
  const rules = await c.env.DB.prepare(`
    SELECT r.*, c.name as cat_name, c.emoji as cat_emoji 
    FROM dare_rules r 
    JOIN categories c ON r.category_id = c.id
  `).all();
  return c.json(rules.results);
});

// Créer une règle
app.post('/api/admin/rules', isAdmin, async (c) => {
  const { category_id, threshold, dare_text } = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO dare_rules (id, category_id, threshold, dare_text) VALUES (?, ?, ?, ?)"
  ).bind(id, category_id, threshold, dare_text).run();
  return c.json({ success: true });
});

// Supprimer une règle
app.delete('/api/admin/rules/:id', isAdmin, async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare("DELETE FROM dare_rules WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

app.patch('/api/admin/rules/:id', isAdmin, async (c) => {
  const id = c.req.param('id');
  const { threshold, dare_text } = await c.req.json();
  await c.env.DB.prepare(
    "UPDATE dare_rules SET threshold = ?, dare_text = ? WHERE id = ?"
  ).bind(threshold, dare_text, id).run();
  return c.json({ success: true });
});

// Afficher l'historique
app.get('/api/users/:id/history', async (c) => {
  const id = c.req.param('id');

  // Points reçus par cet utilisateur
  const received = await c.env.DB.prepare(`
      SELECT p.*, u.name as from_name, c.emoji, c.name as cat_name 
      FROM points_log p
      JOIN users u ON p.from_user_id = u.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.to_user_id = ?
      ORDER BY p.created_at DESC LIMIT 20
  `).bind(id).all();

  // Points donnés par cet utilisateur
  const given = await c.env.DB.prepare(`
    SELECT p.*, u.name as to_name, c.emoji, c.name as cat_name
    FROM points_log p
    JOIN users u ON p.to_user_id = u.id
    JOIN categories c ON p.category_id = c.id
    WHERE p.from_user_id = ?
    ORDER BY p.created_at DESC LIMIT 20
  `).bind(id).all();

  // Gages acquittés par cet utilisateur
  const dares = await c.env.DB.prepare(`
    SELECT dl.*, c.emoji, c.name as cat_name
    FROM dare_log dl
    JOIN categories c ON dl.category_id = c.id
    WHERE dl.user_id = ?
    ORDER BY dl.cleared_at DESC LIMIT 10
  `).bind(id).all();

  return c.json({ received: received.results, given: given.results, dares: dares.results });
});

app.get('/api/admin/points-log', isAdmin, async (c) => {
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
    ORDER BY p.created_at DESC 
    LIMIT 50
  `).all();
  return c.json(results);
});

// Supprimer un point spécifique (Admin uniquement)
app.delete('/api/admin/points/:id', isAdmin, async (c) => {
  const id = c.req.param('id');
  
  const result = await c.env.DB.prepare("DELETE FROM points_log WHERE id = ?")
    .bind(id)
    .run();

  if (result.success) {
    return c.json({ success: true, message: "Point supprimé avec succès" });
  } else {
    return c.json({ error: "Erreur lors de la suppression" }, 500);
  }
});

app.post('/api/points/undo', async (c) => {
  const authHeader = c.req.header('Authorization');
  const userId = authHeader?.replace('Bearer ', '');

  if (!userId) return c.json({ error: "Non autorisé" }, 401);

  // On supprime le point le plus récent créé par cet utilisateur, uniquement dans les 15 dernières secondes
  const result = await c.env.DB.prepare(`
    DELETE FROM points_log
    WHERE id = (
        SELECT id FROM points_log
        WHERE from_user_id = ?
        AND created_at >= datetime('now', '-15 seconds')
        ORDER BY created_at DESC LIMIT 1
    )
  `).bind(userId).run();

  if (result.meta.changes === 0) {
    return c.json({ error: "Délai d'annulation dépassé" }, 403);
  }

  return c.json({ success: true });
});

app.post('/api/admin/clear-category/:userId/:categoryId', isAdmin, async (c) => {
  const { userId, categoryId } = c.req.param();

  try {
    const rule = await c.env.DB.prepare(
      "SELECT dare_text FROM dare_rules WHERE category_id = ?"
    ).bind(categoryId).first<{ dare_text: string }>();

    if (rule) {
      await c.env.DB.prepare(
        "INSERT INTO dare_log (user_id, category_id, dare_text) VALUES (?, ?, ?)"
      ).bind(userId, categoryId, rule.dare_text).run();
    }

    await c.env.DB.prepare(`
      DELETE FROM points_log
      WHERE to_user_id = ? AND category_id = ?
    `).bind(userId, categoryId).run();

    return c.json({ success: true, message: "Compteur catégorie réinitialisé." });
  } catch (err) {
    return c.json({ error: "Erreur lors de la remise à zéro" }, 500);
  }
});

app.get('/api/admin/dare-log', isAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT dl.*, u.name as user_name, c.name as cat_name, c.emoji
    FROM dare_log dl
    JOIN users u ON dl.user_id = u.id
    JOIN categories c ON dl.category_id = c.id
    ORDER BY dl.cleared_at DESC
    LIMIT 50
  `).all();
  return c.json(results);
});

app.get('/api/push/vapid-key', async (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null });
});

app.post('/api/push/subscribe', async (c) => {
  const authHeader = c.req.header('Authorization');
  const userId = authHeader?.replace('Bearer ', '');
  if (!userId) return c.json({ error: 'Non autorisé' }, 401);

  const { endpoint, keys } = await c.req.json();
  await c.env.DB.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
  `).bind(userId, endpoint, keys.p256dh, keys.auth).run();

  return c.json({ success: true });
});

app.get('/', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

app.get('/*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export const onRequest = handle(app);