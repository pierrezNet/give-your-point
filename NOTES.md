# Notes de conception

Le code se veut auto-documenté : on n'y laisse pas de commentaire qui paraphrase. Ce fichier
recueille le **pourquoi** : invariants, compromis, pièges, raisons d'un seuil. Une section par
module ; chaque entrée cite le symbole concerné pour être retrouvée par recherche.

## Architecture

- `functions/[[path]].ts` ne fait que monter l'app Hono (`src/app.ts`) pour Cloudflare Pages.
  Le code vit dans `src/` car tout fichier de `functions/` devient une route Pages.
- Couches, de l'extérieur vers l'intérieur :
  - `routes/*` : une app Hono par domaine fonctionnel. Lit la requête, appelle services et domaine,
    formule la réponse. Les routeurs admin/superadmin/owner sont montés sous leur préfixe avec le
    middleware de rôle appliqué à tout le routeur (`.use('*', requireAdmin)`) : impossible
    d'oublier le contrôle sur une nouvelle route.
  - `services/*` : accès D1 et effets externes (e-mail Resend, push, Turnstile).
  - `domain/*`, `email/templates.ts`, `og.ts`, `push/crypto.ts` : pur, sans I/O, testé unitairement.
- Les tests (`test/`) appellent `app.request()` directement, avec une vraie D1 locale fournie par
  `@cloudflare/vitest-plugin` (Miniflare). Le schéma appliqué est `schema.sql`.
- Le plugin n'isole pas le stockage D1 entre deux tests : `seedDatabase()` vide toutes les tables
  avant de réinsérer le jeu de données.
- Validation : pas de zod. Les corps de requête sont lus par `readJsonObject` (toujours un objet)
  puis chaque champ passe par un normaliseur de `domain/validation.ts` qui renvoie la valeur propre
  ou `null`. Une quinzaine de corps simples ne justifiait pas une dépendance.

## API — erreurs (`src/http/errors.ts`)

- Toute erreur métier passe par `apiError(c, CODE, params?)` → `{ error, code, params? }`.
  `error` reste le message français (compatibilité, logs) ; le frontend affiche
  `t('errors.<CODE>', params)` via `apiErrorMessage` (`public/session.js`) et retombe sur `error`
  pour un code inconnu. Un test vérifie que chaque code a sa traduction FR et EN dans `i18n.js`.
- `handleError` (global) : `SyntaxError` de `c.req.json()` → 400 `INVALID_REQUEST`, tout le reste →
  500 `INTERNAL` sans détail (le détail part dans `console.error`).
- Le format des réponses de succès (clés `gageTriggered`, `topCategories`, `totalPoints`…) est
  volontairement inchangé : le passer en snake_case impose de réécrire le frontend, ce sera fait
  avec la refonte frontend (phase 4).

## Routes — choix non évidents

- `/api/recover` répond toujours `{ ok: true }` après Turnstile, que l'e-mail existe ou non
  (anti-énumération) ; les erreurs d'envoi sont journalisées, jamais renvoyées.
- `/api/track` est best-effort : un échec d'écriture est journalisé mais ne fait jamais échouer la
  page qui envoie la mesure.
- `/api/admin/clear-category` : l'entrée `dare_log` et l'effacement des points partent dans un même
  `batch` (transactionnel) — avant, un échec entre les deux perdait la trace du gage.
- `/api/stats` période « tout » : filtre `(?1 IS NULL OR created_at >= …)` pour conserver d'éventuelles
  lignes sans date, comme l'ancien code sans filtre.
- Flux SSE `/api/events` : à chaque tick (10 s), une seule requête d'empreinte
  (`teamActivityFingerprint` : nombre + id max de `points_log` et `dare_log` de l'équipe). Le
  classement complet (≈ 9 requêtes) n'est recalculé que si l'empreinte change, et au moins une fois
  par minute pour refléter les changements que l'empreinte ne voit pas (règles, membres, décroissance
  de la fenêtre spam). Rien n'est envoyé si le classement est identique au précédent.
- Index `2026-15-indexes.sql` : les quotas de dons, l'annulation et l'historique filtrent par
  `from_user_id` / `to_user_id` sans `team_id` ; sans index, chaque don balayait `points_log`.

## Migrations
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

## Frontend — architecture (`public/js/`)

- Modules ES natifs, sans bundler : `core/` (commun), `home/` (fonctionnalités de l'accueil),
  `pages/` (un point d'entrée par page HTML, chargé par `<script type="module">`).
- **Aucun script inline ni `onclick`** : c'est ce qui autorise la CSP stricte
  (`script-src 'self' https://challenges.cloudflare.com`). Un bouton déclare `data-action="nom"` et
  la page enregistre `registerActions({ nom: (bouton) => … })` (`core/actions.js`, délégation sur
  `document`). Les données utiles passent par des `data-*` (ids uniquement, jamais de texte libre).
- `style-src` garde `'unsafe-inline'` : attributs `style` (largeurs de barres, couleurs de heatmap)
  et blocs `<style>` des pages. Risque faible (pas d'exécution de script), à resserrer quand le CSS
  inline aura migré vers `input.css`.
- `core/session.js` est le seul module qui connaît le stockage : `my_token` (jeton), `my_id` (id,
  relu via `/api/me`). L'ancienne clé `my_user_id` (qui contenait le jeton) est migrée au premier
  accès puis supprimée.
- `core/i18n.js` : `t(clé, params)` **échappe les paramètres** (sortie destinée à `innerHTML`) ;
  `tText(clé, params)` les laisse bruts (sortie destinée à `textContent`, toasts, confirmations).
  Le texte du dictionnaire lui-même est considéré sûr (il peut contenir du HTML voulu).
  Règle : toute autre donnée venant de l'API passe par `escapeHtml` avant `innerHTML`.
- `core/dialogs.js#openModal` : `role="dialog"`, `aria-modal`, titre relié par `aria-labelledby`,
  fermeture par Échap / clic sur le fond / `[data-close-modal]`, focus restitué à la fermeture.
  `isModalOpen()` (présence d'un `[data-modal]`) suspend le rafraîchissement temps réel.
- Dates : `parseSqlDate` interprète les dates SQLite (`AAAA-MM-JJ HH:MM:SS`, sans fuseau) comme de
  l'UTC. L'ancien code les lisait en heure locale (décalage d'1 à 2 h dans l'historique).
- Le shell de l'application (`#app-shell`) est masqué tant qu'on ne sait pas si l'utilisateur est
  connecté : plus de flash « Connexion en cours… » chez les visiteurs.

## Tests de bout en bout (`e2e/`)

- Playwright contre `wrangler pages dev` sur une D1 jetable (`.e2e-db/`, recréée à chaque run depuis
  `schema.sql` + `e2e/seed.sql`). Aucun utilisateur n'a d'e-mail : aucun envoi Resend possible même
  si `.dev.vars` contient une clé. Turnstile utilise les clés de test publiques « always passes ».
- Locale du navigateur forcée en `fr-FR` (sinon Chromium headless sert l'anglais).
- `csp.spec.ts` parcourt toutes les pages et échoue à la moindre erreur console : une violation CSP
  ou une erreur JS introduite par une modification est donc détectée.
- Les tests partagent la base sur un run (exécution séquentielle) : chaque scénario utilise des
  données qui ne gênent pas les autres (ex. le don de point est annulé dans le même test).

## Déploiement — cache des fichiers statiques

- Cloudflare Pages sert JS/CSS avec `max-age=14400` : après un déploiement, un navigateur pouvait
  garder l'ancien `app.js` 4 h alors que le HTML (non mis en cache) était neuf. Le 2026-10-17, ce
  mélange de versions a déconnecté des utilisateurs (ancien `app.js` lisant `my_user_id` déjà migré
  vers `my_token` par le nouveau `session.js`).
- Correctif : la route catch-all pose `Cache-Control: no-cache` sur `.js`/`.css` (revalidation par
  ETag, réponse 304 si inchangé). Les `?v=20261017` dans les pages ne servent qu'à purger les copies
  déjà en cache au moment du correctif ; inutile de les incrémenter ensuite.

## Domaine — règles métier (`src/domain/`)

Ces modules sont purs (aucun accès D1) : les routes lisent la base, passent des compteurs, et
traduisent le résultat en réponse HTTP. C'est ce qui les rend testables sans base.

- `spam.ts` — seuils : 8 dons / 7 j est le plancher (rythme normal ≈ 2-3 / semaine). Le flag exige
  *en plus* un déséquilibre (donné ≥ 3 × (reçu + 1), le +1 amortit les petits volumes et évite la
  division par zéro) *et* d'être ≥ 2 × la moyenne de l'équipe — pour ne pas punir un donneur
  populaire et équilibré. La jauge affichée (`progress`) est volontairement simple : donné / 8.
  La moyenne divise les dons de *tous* les donneurs (anciens membres compris) par les membres
  *actifs* : comportement historique conservé, figé par un test.
- Pardon spammeur = ligne `dare_log` **sans** `category_id` : elle suspend le flag 7 jours et garde
  une trace dans l'historique.
- `dares.ts` — `dareProgressAfterPoint` compare en **égalité stricte** : un gage ne se déclenche
  qu'au point qui atteint pile le seuil. Si un admin baisse un seuil sous le compteur actuel, rien ne
  se déclenche (critique fonctionnelle n° 2, à arbitrer en phase 7) ; un test fige ce comportement.
  `findActiveDare` (affichage) utilise au contraire `>=`.
- `pointRules.ts` — ordre des refus : doublon 5 min → quota 10/jour → quota 3/collègue/jour → gel
  spammeur. Le « jour » est le jour **UTC** de SQLite (`date('now')`), cf. critique n° 7. Les
  compteurs sont lus en parallèle, puis `findPointRefusal` tranche.
- `push/crypto.ts` — `encryptPushPayload` accepte un `seed` (sel + clés émetteur) uniquement pour
  rejouer le vecteur officiel de la RFC 8291 (annexe A) dans les tests ; en production le sel et la
  paire ECDH sont aléatoires à chaque message.

## Service worker (`public/sw.js`)

- Le gestionnaire `fetch` ne fait rien (`letNetworkHandleRequest`) : sa simple présence est exigée
  par certains navigateurs pour proposer l'installation PWA. Aucun cache d'assets volontairement :
  l'app est temps réel, un cache servirait du contenu périmé (cf. l'incident de cache du 2026-10-17).
- `generate-vapid.mjs` : `node generate-vapid.mjs` (Node ≥ 18) génère la paire VAPID des
  notifications push.
