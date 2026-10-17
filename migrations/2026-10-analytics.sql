-- Itération 5 : instrumentation minimale de l'entonnoir (mesure)
-- Table d'événements agrégés, cookieless, sans PII, hébergée dans notre propre D1 (juridiction EU).
-- Seuls des noms d'événements whitelistés côté backend sont insérés (voir /api/track).

CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_name_created ON analytics_events(name, created_at DESC);
