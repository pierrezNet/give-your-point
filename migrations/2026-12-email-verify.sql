-- Itération 7 : vérification d'e-mail (double opt-in implicite) + unicité.
-- Vérif = l'utilisateur s'est connecté au moins une fois via le lien reçu par mail
-- (email_verified passe à 1 dans /login/:token). Les notifs ne partent qu'aux e-mails vérifiés.
-- Prérequis : aucun e-mail en double en base (fait manuellement avant la migration).

ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- Unicité de l'e-mail (les NULL restent distincts en SQLite → plusieurs comptes sans e-mail OK).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
