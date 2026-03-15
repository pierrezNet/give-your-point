PRAGMA foreign_keys = OFF;

-- Suppression propre pour repartir sur une base saine
DROP TABLE IF EXISTS points_log;
DROP TABLE IF EXISTS dare_log;
DROP TABLE IF EXISTS dare_rules;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;

-- Table Catégories (avec forfeit cette fois !)
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

CREATE TABLE dare_rules (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    threshold INTEGER,
    dare_text TEXT
);

CREATE TABLE dare_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    category_id TEXT,
    dare_text TEXT,
    cleared_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);

PRAGMA foreign_keys = ON;