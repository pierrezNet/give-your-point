-- Sépare l'identité du jeton de connexion : chaque utilisateur dont id = token reçoit un nouvel id.
-- Le token est conservé (les liens magiques existants restent valables). Cascade sur toutes les références.

CREATE TABLE user_id_rotation AS
SELECT
  id AS old_id,
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))) AS new_id
FROM users
WHERE id = token;

UPDATE points_log SET from_user_id = (SELECT new_id FROM user_id_rotation WHERE old_id = points_log.from_user_id)
WHERE from_user_id IN (SELECT old_id FROM user_id_rotation);

UPDATE points_log SET to_user_id = (SELECT new_id FROM user_id_rotation WHERE old_id = points_log.to_user_id)
WHERE to_user_id IN (SELECT old_id FROM user_id_rotation);

UPDATE dare_log SET user_id = (SELECT new_id FROM user_id_rotation WHERE old_id = dare_log.user_id)
WHERE user_id IN (SELECT old_id FROM user_id_rotation);

UPDATE push_subscriptions SET user_id = (SELECT new_id FROM user_id_rotation WHERE old_id = push_subscriptions.user_id)
WHERE user_id IN (SELECT old_id FROM user_id_rotation);

UPDATE users SET id = (SELECT new_id FROM user_id_rotation WHERE old_id = users.id)
WHERE id IN (SELECT old_id FROM user_id_rotation);

DROP TABLE user_id_rotation;
