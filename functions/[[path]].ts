import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Bindings }>()

// CE BLOC VA FORCER LA CRÉATION À CHAQUE RECHARGEMENT
app.use('/api/*', async (c, next) => {
  const sql = `
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, forfeit TEXT, active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1, token TEXT, role TEXT DEFAULT 'user');
    CREATE TABLE IF NOT EXISTS points_log (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user_id TEXT, to_user_id TEXT, category_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS dare_rules (id TEXT PRIMARY KEY, category_id TEXT, threshold INTEGER, dare_text TEXT);
    
    INSERT OR REPLACE INTO users (id, name, active, token, role) VALUES ('883136a9-23bd-4b57-9985-59d4b8f1117b', 'Emmanuel', 1, '883136a9-23bd-4b57-9985-59d4b8f1117b', 'admin');
  `;
  try {
    await c.env.DB.exec(sql);
  } catch (e) {
    // On ignore si déjà créé
  }
  await next();
});

// Log pour confirmer que l'API est chargée
console.log("🚀 API Hono chargée via functions/[[path]].ts");

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

app.get('/api/debug-db', async (c) => {
  // Cette commande SQL spéciale liste les fichiers de base de données ouverts
  const dbFiles = await c.env.DB.prepare("PRAGMA database_list").all();
  return c.json({
    message: "Où est ma base ?",
    data: dbFiles.results,
    env_keys: Object.keys(c.env)
  });
});

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

// Route pour les données des utilisateurs
app.get('/api/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM users').all()
  return c.json(results)
})

// Route pour récupérer les catégories
app.get('/api/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM categories WHERE active = 1').all();
    return c.json(results);
  } catch (e: any) {
    console.error("❌ Erreur D1:", e.message); // Ceci va s'afficher dans ton terminal
    return c.json({ error: e.message }, 500);
  }
});

// Route pour enregistrer un point
app.post('/api/points', async (c) => {
  try {
    const body = await c.req.json();
    const { to_user_id, category_id } = body;

    const authHeader = c.req.header('Authorization');
    const userIdFromClient = authHeader?.replace('Bearer ', '');

    // Sécurité : on vérifie que l'ID n'est pas vide avant de bind
    if (!userIdFromClient) {
        return c.json({ error: "Session manquante" }, 401);
    }

    // On cherche par ID
    const fromUser = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?")
      .bind(userIdFromClient)
      .first<{ id: string }>();

    if (!fromUser) {
      return c.json({ error: "Utilisateur non reconnu" }, 401);
    }

    if (fromUser.id === to_user_id) {
      return c.json({ error: "Interdit de s'auto-mousser ! 😅" }, 400);
    }

    await c.env.DB.prepare(
      'INSERT INTO points_log (from_user_id, to_user_id, category_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
    )
    .bind(fromUser.id, to_user_id, category_id)
    .run();

    return c.json({ success: true });

  } catch (err) {
    console.error("Erreur D1:", err);
    return c.json({ success: false, error: "Erreur serveur" }, 500);
  }
});

app.get('/api/users-stats', async (c) => {
  try {
    // 1. Récupération sécurisée des données
    const [catRes, statsRes, rulesRes, usersRes] = await Promise.all([
      c.env.DB.prepare("SELECT id, name, emoji FROM categories").all(),
      c.env.DB.prepare("SELECT to_user_id, category_id, COUNT(*) as total FROM points_log GROUP BY to_user_id, category_id").all<PointStat>(),
      c.env.DB.prepare("SELECT * FROM dare_rules").all<DareRule>(),
      c.env.DB.prepare("SELECT id, name FROM users WHERE active = 1").all()
    ]);

    const catMap = new Map((catRes.results || []).map(cat => [cat.id, cat]));
    const stats = statsRes.results || [];
    const rules = rulesRes.results || [];
    const users = usersRes.results || [];

    const data = users.map(user => {
      const userPoints = stats.filter(p => p.to_user_id === user.id);
      const total_points = userPoints.reduce((sum, p) => sum + p.total, 0);

      const topCategories = userPoints
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .map(p => {
          const category = catMap.get(p.category_id);
          return {
            count: p.total,
            emoji: category?.emoji || '✨',
            cat_name: category?.name || 'Inconnu'
          };
        });

      // Logique du gage sécurisée
      let activeDare = null;
      if (rules.length > 0) {
          for (const rule of rules) {
            const score = userPoints.find(p => p.category_id === rule.category_id);
            if (score && score.total >= rule.threshold) {
              activeDare = rule.dare_text; 
              break; 
            }
          }
      }

      return { ...user, total_points, topCategories, gage: activeDare };
    });

    const rankedData = data.sort((a, b) => b.total_points - a.total_points)
                           .map((u, index) => ({ ...u, rank: index + 1 }));

    return c.json(rankedData);
  } catch (e: any) {
    console.error("🔥 Erreur Stats:", e.message);
    return c.json({ error: "Erreur calcul stats", details: e.message }, 500);
  }
});

app.get('/api/leaderboard', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT 
      u.id, 
      u.name, 
      COUNT(p.id) as total_points
    FROM users u
    LEFT JOIN points_log p ON u.id = p.to_user_id
    GROUP BY u.id
    ORDER BY total_points DESC
  `).all();
  
  return c.json(results);
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
  const token = crypto.randomUUID().split('-')[0];
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

// Lister les gages (Admin)
app.get('/api/admin/dares', async (c) => {
  // Il faut ABSOLUMENT récupérer category_id ici
  const { results } = await c.env.DB.prepare(`
    SELECT 
      to_user_id as userId, 
      category_id as categoryId, 
      COUNT(*) as count,
      'Gage Croissants' as gage -- ou ta logique de nom de gage
    FROM points_log
    GROUP BY to_user_id, category_id
    HAVING count >= 10 -- Ton seuil
  `).all();
  
  return c.json(results);
});

// Créer un nouveau gage
app.post('/api/admin/dares', isAdmin, async (c) => {
  const { task, emoji } = await c.req.json();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO dares (id, task, emoji) VALUES (?, ?, ?)").bind(id, task, emoji).run();
  return c.json({ success: true });
});

// Assigner un gage à un utilisateur
app.post('/api/admin/users/:userId/assign-dare', isAdmin, async (c) => {
  const userId = c.req.param('userId');
  const { dareId } = await c.req.json(); // dareId peut être null pour enlever le gage
  await c.env.DB.prepare("UPDATE users SET current_dare_id = ? WHERE id = ?").bind(dareId, userId).run();
  return c.json({ success: true });
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

  return c.json({ received: received.results, given: given.results });
});

app.post('/api/points/undo', async (c) => {
  const authHeader = c.req.header('Authorization');
  const userId = authHeader?.replace('Bearer ', '');

  if (!userId) return c.json({ error: "Non autorisé" }, 401);

  // On supprime le point le plus récent créé par cet utilisateur
  await c.env.DB.prepare(`
    DELETE FROM points_log 
    WHERE id = (
        SELECT id FROM points_log 
        WHERE from_user_id = ? 
        ORDER BY created_at DESC LIMIT 1
    )
  `).bind(userId).run();

  return c.json({ success: true });
});

app.post('/api/admin/clear-category/:userId/:categoryId', async (c) => {
  const { userId, categoryId } = c.req.param();

  try {
    await c.env.DB.prepare(`
      DELETE FROM points_log 
      WHERE to_user_id = ? AND category_id = ?
    `).bind(userId, categoryId).run();

    return c.json({ success: true, message: "Compteur catégorie réinitialisé." });
  } catch (err) {
    return c.json({ error: "Erreur lors de la remise à zéro" }, 500);
  }
});

app.get('/', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// Et pour être sûr que les autres fichiers (app.js, admin.html) passent :
app.get('/*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) {
    return next();
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export const onRequest = handle(app);
//export default handle(app);