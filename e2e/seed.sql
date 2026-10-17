INSERT INTO companies (id, name) VALUES ('c-acme', 'Acme'), ('c-globex', 'Globex');
INSERT INTO teams (id, company_id, name, invite_code) VALUES
  ('t-dev', 'c-acme', 'Dev', 'e2e-dev'),
  ('t-ops', 'c-acme', 'Ops', 'e2e-ops'),
  ('t-globex', 'c-globex', 'Globex', 'e2e-globex');
INSERT INTO users (id, token, team_id, name, role, active) VALUES
  ('u-owner', 'k-owner', 't-dev', 'Olivia', 'owner', 1),
  ('u-admin', 'k-admin', 't-dev', 'Adam', 'admin', 1),
  ('u-alice', 'k-alice', 't-dev', 'Alice', 'member', 1),
  ('u-bob', 'k-bob', 't-dev', 'Bob', 'member', 1),
  ('u-carol', 'k-carol', 't-dev', 'Carol', 'member', 1),
  ('u-dan', 'k-dan', 't-dev', 'Dan', 'member', 0),
  ('u-oscar', 'k-oscar', 't-ops', 'Oscar', 'member', 1),
  ('u-gina', 'k-gina', 't-globex', 'Gina', 'superadmin', 1);
INSERT INTO categories (id, team_id, name, emoji) VALUES
  ('cat-help', 't-dev', 'Entraide', '🤝'),
  ('cat-joke', 't-dev', 'Blague', '😂'),
  ('cat-ops', 't-ops', 'Astreinte', '🛠️');
INSERT INTO dare_rules (id, team_id, category_id, threshold, dare_text) VALUES ('rule-joke', 't-dev', 'cat-joke', 3, 'Croissants');
INSERT INTO points_log (team_id, from_user_id, to_user_id, category_id, reason, created_at) VALUES
  ('t-dev', 'u-admin', 'u-carol', 'cat-joke', 'La blague du lundi', datetime('now', '-2 days')),
  ('t-dev', 'u-owner', 'u-carol', 'cat-joke', NULL, datetime('now', '-2 days')),
  ('t-dev', 'u-admin', 'u-bob', 'cat-help', NULL, datetime('now', '-3 days')),
  ('t-ops', 'u-oscar', 'u-oscar', 'cat-ops', NULL, datetime('now', '-1 days'));
