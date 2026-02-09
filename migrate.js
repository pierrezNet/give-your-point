const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

let sql = "-- Migration des données JSON vers D1\n\n";

// 1. Migration des Catégories
Object.entries(data.categories).forEach(([id, cat]) => {
    const name = cat.name.replace(/'/g, "''");
    const forfeit = (cat.forfeit || "").replace(/'/g, "''");
    sql += `INSERT OR REPLACE INTO categories (id, name, emoji, forfeit) VALUES ('${id}', '${name}', '${cat.emoji}', '${forfeit}');\n`;
});

// 2. Migration des Utilisateurs (avec génération de tokens)
Object.entries(data.users).forEach(([id, user]) => {
    const name = user.name.replace(/'/g, "''");
    // On utilise l'ID comme token par défaut pour la migration
    sql += `INSERT OR REPLACE INTO users (id, name, active, token) VALUES ('${id}', '${name}', 1, '${id}');\n`;
});

// 3. Migration des Logs (L'historique des points)
data.logs.forEach(log => {
    // Conversion du timestamp UNIX en format DATETIME SQLite
    const date = new Date(log.timestamp * 1000).toISOString();
    sql += `INSERT INTO points_log (from_user_id, to_user_id, category_id, created_at) VALUES ('${log.from_user_id}', '${log.to_user_id}', '${log.category_id}', '${date}');\n`;
});

fs.writeFileSync('migration.sql', sql);
console.log("✅ migration.sql généré avec succès !");