# Notes de conception

Le code se veut auto-documenté : on n'y laisse pas de commentaire qui paraphrase. Ce fichier
recueille le **pourquoi** : invariants, compromis, pièges, raisons d'un seuil. Une section par
module ; chaque entrée cite le symbole concerné pour être retrouvée par recherche.

## Architecture

- `functions/[[path]].ts` ne fait que monter l'app Hono (`src/app.ts`) pour Cloudflare Pages.
  Le code vit dans `src/` car tout fichier de `functions/` devient une route Pages.
- Les tests (`test/`) appellent `app.request()` directement, avec une vraie D1 locale fournie par
  `@cloudflare/vitest-plugin` (Miniflare). Le schéma appliqué est `schema.sql`.
- Le plugin n'isole pas le stockage D1 entre deux tests : `seedDatabase()` vide toutes les tables
  avant de réinsérer le jeu de données.

## Migrations

- `migrations/2026-05`, `-06` et `-07` sont des migrations ponctuelles déjà appliquées en prod.
  Les UUID d'utilisateurs y sont masqués (`<uuid-masqué>`) : ces UUID étaient aussi des jetons
  de connexion, le dépôt est public.
- `schema.sql` est la référence complète (il intègre toutes les migrations) ; `init_db.sql` en
  est une copie utilisée par `npm run db:init`.

## Sécurité

- Historique : jusqu'à la phase 1 de la revue d'octobre 2026, `users.id == users.token`. Tout id
  exposé au frontend était donc un jeton de connexion.
