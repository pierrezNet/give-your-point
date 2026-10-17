-- Migration superadmin DSAF
-- Promeut Emmanuel en role='superadmin' (héritage : conserve tous les droits admin via la hiérarchie).
-- À exécuter une seule fois sur la prod via `npm run db:migrate:superadmin`.

UPDATE users SET role = 'superadmin' WHERE id = '<uuid-masqué>';
