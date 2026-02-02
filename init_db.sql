-- Suppression des tables si elles existent pour repartir à zéro
DROP TABLE IF EXISTS points_log;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS points_log;
DROP TABLE IF EXISTS dare_rules;

-- Création des tables

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dare_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    points INTEGER DEFAULT 0
);

CREATE TABLE points_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id TEXT REFERENCES users(id),
    to_user_id TEXT REFERENCES users(id),
    category_id TEXT REFERENCES categories(id),
    -- On utilise DATETIME avec CURRENT_TIMESTAMP pour l'historique
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP 
);


-- Créer la table des règles manquante
CREATE TABLE IF NOT EXISTS dare_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    points INTEGER DEFAULT 0
);