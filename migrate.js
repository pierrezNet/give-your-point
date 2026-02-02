const fs = require('fs');

// Vérifie si le fichier existe avant de tenter de le lire
if (!fs.existsSync('./data.json')) {
    console.error("Erreur : Le fichier data.json est introuvable à la racine.");
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));

let sql = "PRAGMA foreign_keys=OFF;\n"; // Désactive temporairement les contraintes pour l'import

// Migration des Utilisateurs
if (data.users) {
    for (const [id, user] of Object.entries(data.users)) {
        // On échappe les apostrophes pour éviter les erreurs SQL
        const safeName = user.name.replace(/'/g, "''");
        sql += `INSERT INTO users (id, name) VALUES ('${id}', '${safeName}');\n`;
    }
}

// Migration des Catégories
if (data.categories) {
    for (const [id, cat] of Object.entries(data.categories)) {
        const safeName = cat.name.replace(/'/g, "''");
        sql += `INSERT INTO categories (id, name, emoji, forfeit) VALUES ('${id}', '${safeName}', '${cat.emoji || ''}', '${(cat.forfeit || '').replace(/'/g, "''")}');\n`;
    }
}

// Migration de l'historique (avec vérification si la clé existe)
const history = data.history || data.points_log || [];
history.forEach(entry => {
    sql += `INSERT INTO points_log (from_user_id, to_user_id, category_id, timestamp) VALUES ('${entry.from_user_id}', '${entry.to_user_id}', '${entry.category_id}', ${entry.timestamp});\n`;
});

sql += "PRAGMA foreign_keys=ON;\n";

fs.writeFileSync('./migration.sql', sql);
console.log("Fichier migration.sql généré avec succès !");