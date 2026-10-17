-- Migration email : ajout d'une colonne email aux users pour les notifications Resend
-- Les users existants ont email = NULL (pas de notification jusqu'à ce qu'un admin la renseigne).

ALTER TABLE users ADD COLUMN email TEXT;
