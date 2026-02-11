PRAGMA foreign_keys = OFF;

-- Suppression propre pour repartir sur une base saine
DROP TABLE IF EXISTS points_log;
DROP TABLE IF EXISTS dare_rules;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT,
    forfeit TEXT,
    active INTEGER DEFAULT 1
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    token TEXT
);

CREATE TABLE points_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id TEXT,
    to_user_id TEXT,
    category_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Test d'insertion immédiat pour vérifier que ça fonctionne
INSERT INTO categories (id, name, emoji, forfeit, active) VALUES ('cat_1', 'Méchanceté', '😈', 'Amener des croissants', 1),
INSERT INTO users (id, name, token, active) VALUES ('user_test', 'Emmanuel', 'mon-token', 1);

PRAGMA foreign_keys = ON;