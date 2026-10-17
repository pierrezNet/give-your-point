-- Migration multi-tenant : Société → Équipe → Utilisateur
-- À exécuter une seule fois sur la prod via `npm run db:migrate:prod`.
-- Données initiales : DSAF + BEPN (Emmanuel admin) + PASSI (Emilia admin).

-- 1. Nouvelles tables
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teams_company ON teams(company_id);

-- 2. Colonnes ajoutées (one-shot : ces ALTER échoueront si la migration a déjà tourné)
ALTER TABLE users ADD COLUMN team_id TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE categories ADD COLUMN team_id TEXT;
ALTER TABLE dare_rules ADD COLUMN team_id TEXT;
ALTER TABLE points_log ADD COLUMN team_id TEXT;
ALTER TABLE dare_log ADD COLUMN team_id TEXT;

-- 3. Indexes pour le filtrage par équipe
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id, active);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_categories_team ON categories(team_id, active);
CREATE INDEX IF NOT EXISTS idx_points_team_created ON points_log(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_team_to_cat ON points_log(team_id, to_user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_dare_rules_team ON dare_rules(team_id);
CREATE INDEX IF NOT EXISTS idx_dare_log_team ON dare_log(team_id, cleared_at DESC);

-- 4. Données initiales : DSAF + BEPN + PASSI
INSERT OR IGNORE INTO companies (id, name, active) VALUES ('00000000-0000-4000-8000-000000000001', 'DSAF', 1);
INSERT OR IGNORE INTO teams (id, company_id, name, active) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'BEPN', 1);
INSERT OR IGNORE INTO teams (id, company_id, name, active) VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'PASSI', 1);

-- 5. Backfill : tout sur BEPN par défaut, puis Emilia bascule vers PASSI
UPDATE users SET team_id = '00000000-0000-4000-8000-000000000002' WHERE team_id IS NULL;
UPDATE users SET team_id = '00000000-0000-4000-8000-000000000003' WHERE id = '<uuid-masqué>';

UPDATE users SET role = 'admin' WHERE id = '<uuid-masqué>';
UPDATE users SET role = 'admin' WHERE id = '<uuid-masqué>';

UPDATE categories SET team_id = '00000000-0000-4000-8000-000000000002' WHERE team_id IS NULL;
UPDATE dare_rules SET team_id = '00000000-0000-4000-8000-000000000002' WHERE team_id IS NULL;
UPDATE points_log SET team_id = '00000000-0000-4000-8000-000000000002' WHERE team_id IS NULL;
UPDATE dare_log SET team_id = '00000000-0000-4000-8000-000000000002' WHERE team_id IS NULL;

-- 6. Nettoyage : retirer les points cross-équipe historiques (Emmanuel → Emilia, etc.)
DELETE FROM points_log WHERE from_user_id IN (SELECT id FROM users WHERE team_id != points_log.team_id) OR to_user_id IN (SELECT id FROM users WHERE team_id != points_log.team_id);

-- 7. Catégories PASSI : copies des catégories BEPN actives pour qu'Emilia ait un point de départ
INSERT OR IGNORE INTO categories (id, team_id, name, emoji, forfeit, active) VALUES ('f1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'Méchanceté', '👿', 'Viennoiseries', 1);
INSERT OR IGNORE INTO categories (id, team_id, name, emoji, forfeit, active) VALUES ('f1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'Super blague', '😂', 'Continue ainsi', 1);
INSERT OR IGNORE INTO categories (id, team_id, name, emoji, forfeit, active) VALUES ('f1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'Flemme', '😴', 'Chouquettes', 1);
INSERT OR IGNORE INTO categories (id, team_id, name, emoji, forfeit, active) VALUES ('f1000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Désespérance', '😩', '1 séance chez le psy', 1);
INSERT OR IGNORE INTO categories (id, team_id, name, emoji, forfeit, active) VALUES ('f1000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 'Colère', '😡', 'Chocolats', 1);
INSERT OR IGNORE INTO categories (id, team_id, name, emoji, forfeit, active) VALUES ('f1000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003', 'Blague affligeante', '😓', 'Bonbons', 1);
INSERT OR IGNORE INTO categories (id, team_id, name, emoji, forfeit, active) VALUES ('f1000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000003', 'Mauvaise foi', '🤷', 'Jus de fruits', 1);
