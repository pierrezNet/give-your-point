-- Itération 6 : lien d'auto-inscription par équipe (invitation)
-- Chaque équipe reçoit un code d'invitation opaque et partageable.
-- Un visiteur muni du lien /join/<code> peut s'ajouter lui-même comme membre.

ALTER TABLE teams ADD COLUMN invite_code TEXT;

-- Backfill des équipes existantes avec un code aléatoire (16 hex).
UPDATE teams SET invite_code = lower(hex(randomblob(8))) WHERE invite_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);
