-- Migration i18n : ajout d'une colonne locale aux users
-- Permet aux emails de notification d'être envoyés dans la langue préférée du destinataire.
-- NULL = défaut français.

ALTER TABLE users ADD COLUMN locale TEXT;
