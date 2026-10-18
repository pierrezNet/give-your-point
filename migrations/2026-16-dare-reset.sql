-- Acquitter un gage ne supprime plus de points : le compteur repart du dernier dare_log du membre sur ce badge.
CREATE INDEX IF NOT EXISTS idx_dare_log_reset ON dare_log(team_id, user_id, category_id, cleared_at);
-- categories.forfeit n'était jamais lu : les gages par défaut sont désormais des dare_rules créées à l'onboarding.
ALTER TABLE categories DROP COLUMN forfeit;
