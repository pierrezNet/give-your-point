-- Purge des espaces inactifs depuis plus de 6 mois (politique RGPD).
-- Critère : aucun point distribué dans la company depuis 6 mois ET company créée il y a plus de 6 mois.
-- Cascade : push_subscriptions → dare_log → points_log → users → categories → dare_rules → teams → companies
-- À exécuter manuellement via : npm run db:cleanup-inactive (remote) ou :local

-- 1. CTE : sociétés à purger
-- (SQLite ne supporte pas WITH dans DELETE directement de manière universelle ; on inline)

-- Sécurité : un dry-run préalable (commenté) :
-- SELECT c.id, c.name, c.created_at,
--        (SELECT MAX(p.created_at) FROM points_log p JOIN teams t ON t.id = p.team_id WHERE t.company_id = c.id) AS last_point
-- FROM companies c
-- WHERE c.created_at < datetime('now', '-6 months')
--   AND NOT EXISTS (
--     SELECT 1 FROM points_log p JOIN teams t ON t.id = p.team_id
--     WHERE t.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
--   );

-- 2. Push subscriptions (rattachées aux users des companies inactives)
DELETE FROM push_subscriptions
WHERE user_id IN (
  SELECT u.id FROM users u JOIN teams t ON t.id = u.team_id
  WHERE t.company_id IN (
    SELECT c.id FROM companies c
    WHERE c.created_at < datetime('now', '-6 months')
      AND NOT EXISTS (
        SELECT 1 FROM points_log p JOIN teams t2 ON t2.id = p.team_id
        WHERE t2.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
      )
  )
);

-- 3. Dare log
DELETE FROM dare_log
WHERE team_id IN (
  SELECT t.id FROM teams t
  WHERE t.company_id IN (
    SELECT c.id FROM companies c
    WHERE c.created_at < datetime('now', '-6 months')
      AND NOT EXISTS (
        SELECT 1 FROM points_log p JOIN teams t2 ON t2.id = p.team_id
        WHERE t2.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
      )
  )
);

-- 4. Points log
DELETE FROM points_log
WHERE team_id IN (
  SELECT t.id FROM teams t
  WHERE t.company_id IN (
    SELECT c.id FROM companies c
    WHERE c.created_at < datetime('now', '-6 months')
      AND NOT EXISTS (
        SELECT 1 FROM points_log p JOIN teams t2 ON t2.id = p.team_id
        WHERE t2.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
      )
  )
);

-- 5. Users
DELETE FROM users
WHERE team_id IN (
  SELECT t.id FROM teams t
  WHERE t.company_id IN (
    SELECT c.id FROM companies c
    WHERE c.created_at < datetime('now', '-6 months')
      AND NOT EXISTS (
        SELECT 1 FROM points_log p JOIN teams t2 ON t2.id = p.team_id
        WHERE t2.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
      )
  )
);

-- 6. Categories
DELETE FROM categories
WHERE team_id IN (
  SELECT t.id FROM teams t
  WHERE t.company_id IN (
    SELECT c.id FROM companies c
    WHERE c.created_at < datetime('now', '-6 months')
      AND NOT EXISTS (
        SELECT 1 FROM points_log p JOIN teams t2 ON t2.id = p.team_id
        WHERE t2.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
      )
  )
);

-- 7. Dare rules
DELETE FROM dare_rules
WHERE team_id IN (
  SELECT t.id FROM teams t
  WHERE t.company_id IN (
    SELECT c.id FROM companies c
    WHERE c.created_at < datetime('now', '-6 months')
      AND NOT EXISTS (
        SELECT 1 FROM points_log p JOIN teams t2 ON t2.id = p.team_id
        WHERE t2.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
      )
  )
);

-- 8. Teams
DELETE FROM teams
WHERE company_id IN (
  SELECT c.id FROM companies c
  WHERE c.created_at < datetime('now', '-6 months')
    AND NOT EXISTS (
      SELECT 1 FROM points_log p JOIN teams t2 ON t2.id = p.team_id
      WHERE t2.company_id = c.id AND p.created_at >= datetime('now', '-6 months')
    )
);

-- 9. Companies
DELETE FROM companies
WHERE created_at < datetime('now', '-6 months')
  AND NOT EXISTS (
    SELECT 1 FROM points_log p JOIN teams t ON t.id = p.team_id
    WHERE t.company_id = companies.id AND p.created_at >= datetime('now', '-6 months')
  );
