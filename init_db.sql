PRAGMA foreign_keys = OFF;

-- Suppression propre pour repartir sur une base saine
DROP TABLE IF EXISTS points_log;
DROP TABLE IF EXISTS dare_log;
DROP TABLE IF EXISTS dare_rules;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS companies;

CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_teams_company ON teams(company_id);

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT,
    forfeit TEXT,
    active INTEGER DEFAULT 1
);

CREATE INDEX idx_categories_team ON categories(team_id, active);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    active INTEGER DEFAULT 1,
    token TEXT
);

CREATE INDEX idx_users_team ON users(team_id, active);
CREATE INDEX idx_users_token ON users(token);

CREATE TABLE points_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    from_user_id TEXT,
    to_user_id TEXT,
    category_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_points_team_created ON points_log(team_id, created_at DESC);
CREATE INDEX idx_points_team_to_cat ON points_log(team_id, to_user_id, category_id);

CREATE TABLE dare_rules (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    category_id TEXT,
    threshold INTEGER,
    dare_text TEXT
);

CREATE INDEX idx_dare_rules_team ON dare_rules(team_id);

CREATE TABLE dare_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    user_id TEXT,
    category_id TEXT,
    dare_text TEXT,
    cleared_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dare_log_team ON dare_log(team_id, cleared_at DESC);

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
