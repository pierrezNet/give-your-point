-- Suppression des tables si elles existent pour repartir à zéro
DROP TABLE IF EXISTS points_log;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;

-- Création des tables
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1, -- Ajouté pour gérer l'activation/désactivation
    token TEXT,                -- Ajouté pour le Magic Link
    avatar_url TEXT
);

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT,
    forfeit TEXT               -- C'est ici que tu stockeras le texte du "Gage"
);

CREATE TABLE points_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id TEXT REFERENCES users(id),
    to_user_id TEXT REFERENCES users(id),
    category_id TEXT REFERENCES categories(id),
    -- On utilise DATETIME avec CURRENT_TIMESTAMP pour l'historique
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP 
);

-- Insertion des catégories de base
INSERT INTO categories (id, name, emoji, forfeit) VALUES 
('cat_1', 'Méchanceté', '😈', 'Apporter des viennoiseries'),
('cat_2', 'Mauvaise foi', '🤥', 'Payer le café'),
('cat_3', 'Entraide', '🤝', 'Aucun (Bonus)');