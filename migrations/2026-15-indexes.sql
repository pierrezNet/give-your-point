-- Index des requêtes fréquentes filtrées par donneur ou par destinataire sans team_id
-- (quotas de dons, annulation, historique, rejet d'un inscrit, historique des gages).
CREATE INDEX IF NOT EXISTS idx_points_from_created ON points_log(from_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_points_to ON points_log(to_user_id);
CREATE INDEX IF NOT EXISTS idx_dare_log_user ON dare_log(user_id);
