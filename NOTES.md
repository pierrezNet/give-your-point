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

## Sécurité — authentification (`src/app.ts`)

- **`id` ≠ `token`** depuis la migration `2026-14-split-token.sql`. Avant, `users.id == users.token` :
  tout id renvoyé au frontend (`/api/users`, stats, historique) était un jeton de connexion, donc
  n'importe quel membre pouvait se connecter en tant qu'un autre. La migration a changé les id et
  **conservé les jetons** (choix produit : ne pas casser les liens distribués). Risque résiduel
  accepté : un jeton déjà lu par un coéquipier reste valable jusqu'à sa régénération.
- `newUserCredentials()` est le seul moyen de créer un couple id/jeton ; ne jamais réutiliser l'id
  comme jeton.
- **Aucune réponse ne contient de `token`**, sauf : `POST /api/onboarding` (le fondateur reçoit le
  sien pour se connecter) et `regenerate-link` quand `is_self` (le frontend remplace sa session,
  sinon l'admin qui régénère son propre lien se déconnecte). Les liens d'autrui passent par
  `POST …/magic-link` / `login_url`, sous contrôle de rôle.
- `extractToken` : `Bearer ` obligatoire ; `?t=` accepté **uniquement** sur `/api/events`, car
  `EventSource` ne sait pas envoyer d'en-tête.
- `/login/:token` redirige vers `/#login=<token>` : le fragment n'est jamais envoyé au serveur ni
  dans le `Referer`, contrairement à l'ancien `?login_id=`. `session.js` accepte encore
  `?login_id=` pour les onglets ouverts avant le déploiement.
- `getUserByToken` exige équipe et société actives : désactiver une équipe coupe les sessions.
- `appBaseUrl` ignore l'en-tête Host sauf `localhost`/`127.0.0.1` exacts (avant : `startsWith`,
  contournable avec `localhost.attaquant.tld` → liens magiques empoisonnés dans les e-mails).

## Sécurité — hiérarchie des rôles

- `outranks(acteur, cible)` : rang strictement supérieur. Utilisé pour désactiver / restaurer /
  rejeter un membre et pour `promote` (un superadmin ne peut plus rétrograder un owner ni un pair).
- `canManageLink` = soi-même OU `outranks` : on peut toujours obtenir ou régénérer son propre lien.
- `demote` garde l'ancienne règle (un superadmin peut révoquer un autre superadmin, garde-fou
  « dernier superadmin » + owner intouchable) : besoin réel de gouvernance entre pairs.
- Un admin ne peut pas modifier son propre statut (anti-lockout), ni gérer un autre admin : c'est le
  rôle du superadmin.

## Sécurité — divers

- En-têtes posés par un middleware global (Pages `_headers` ne s'applique pas aux réponses des
  Functions). La CSP actuelle ne contient que des directives compatibles avec les scripts inline
  (`frame-ancestors`, `base-uri`, `object-src`) ; la CSP stricte viendra quand l'inline aura disparu.
- La route catch-all recopie la réponse `ASSETS` (`new Response(body, asset)`) car ses en-têtes sont
  immuables.
- `CRON_SECRET` : en-tête uniquement (une URL finit dans les logs), comparaison à temps constant sur
  les condensats SHA-256 (longueurs égales exigées par `timingSafeEqual`).
- Push : liste blanche de services (`PUSH_SERVICE_DOMAINS`) ; sinon le Worker POSTerait vers une URL
  arbitraire à chaque point reçu (SSRF).
- Turnstile : pas de vérification du `hostname` — les clés de test renvoient `example.com`, et la
  restriction de domaine est déjà configurée côté sitekey. L'IP n'est plus journalisée (RGPD).
- `/api/track` exige un `Origin` same-origin (les navigateurs l'envoient sur tout POST, beacon compris).

## Frontend — session (`public/session.js`)

- Seul module qui connaît le stockage : `my_token` (jeton) et `my_id` (id, relu via `/api/me`).
  L'ancienne clé `my_user_id` contenait le jeton : elle est migrée vers `my_token` au premier
  chargement puis supprimée.
- `escapeHtml` y est défini une fois pour toutes les pages. Règle : toute donnée venant de l'API
  passe par `escapeHtml` avant `innerHTML`, et aucun texte libre n'est placé dans un `onclick` —
  on passe un id et on relit le nom dans une `Map` (`adminUsersById`, `teamsById`…).

## Déploiement — cache des fichiers statiques

- Cloudflare Pages sert JS/CSS avec `max-age=14400` : après un déploiement, un navigateur pouvait
  garder l'ancien `app.js` 4 h alors que le HTML (non mis en cache) était neuf. Le 2026-10-17, ce
  mélange de versions a déconnecté des utilisateurs (ancien `app.js` lisant `my_user_id` déjà migré
  vers `my_token` par le nouveau `session.js`).
- Correctif : la route catch-all pose `Cache-Control: no-cache` sur `.js`/`.css` (revalidation par
  ETag, réponse 304 si inchangé). Les `?v=20261017` dans les pages ne servent qu'à purger les copies
  déjà en cache au moment du correctif ; inutile de les incrémenter ensuite.
