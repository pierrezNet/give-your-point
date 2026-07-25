# 🎯 Donne Ton Point

Application de gamification interne pour s'attribuer des points et déclencher des gages au sein d'une équipe.

L'app est **multi-tenant** : chaque société peut héberger plusieurs équipes étanches, avec son propre catalogue de badges et de gages. La création d'un espace est autonome (formulaire public). Interfaces disponibles en **français et en anglais**.

## ✨ Aperçu fonctionnel

- 🎁 **Donner un point** dans une catégorie (drag-and-drop ou clic mobile)
- ⚡ **Mises à jour temps réel** via Server-Sent Events
- ⚖️ **Gages automatiques** quand un seuil est atteint sur une catégorie
- 🛡️ **Anti-triche** : raison optionnelle par point, plafond 3/collègue/jour, gage « spammeur » automatique (calcul sur 7 jours)
- 🏛️ **Hiérarchie** : `member` < `admin` < `superadmin` < `owner`
- 🔗 **Invitation** : lien d'auto-inscription par équipe + envoi du lien magique par email, avec **vérification d'e-mail** (unicité, « lien perdu »)
- ✉️ **Notifications email** (Resend, uniquement aux adresses vérifiées) + notifications **push** (WebPush)
- 📊 **Digest hebdomadaire** par email + **entonnoir d'acquisition** (console owner)
- 👀 **Activité inter-équipes** (preuve sociale, agrégée) · 📱 **PWA installable**
- 🌐 **i18n** FR + EN avec détection auto et bascule manuelle

## 🛠️ Stack technique

- **Frontend** : HTML/JS/CSS vanilla, Tailwind CSS v4
- **Backend** : [Hono.js](https://hono.dev/) v4 sur Cloudflare Workers
- **Base** : Cloudflare D1 (SQLite)
- **Anti-bot** : Cloudflare Turnstile (sur l'onboarding)
- **Email** : [Resend](https://resend.com/) (API HTTP transactionnelle)
- **Déploiement** : Cloudflare Pages via Wrangler CLI

## 🚀 Démarrage rapide (dev local)

```bash
# 1. Dépendances
npm install

# 2. Créer .dev.vars à la racine (jamais committé)
cat > .dev.vars <<'EOF'
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY_JWK=
VAPID_SUBJECT=mailto:your@email
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@example.com
CRON_SECRET=
APP_BASE_URL=http://localhost:8788
EOF

# 3. Créer la base locale + données d'exemple
npm run db:reset

# 4. Lancer le serveur
npm run dev
```

L'app est alors disponible sur <http://localhost:8788>.

Les valeurs `TURNSTILE_*` ci-dessus sont les clés de test publiques Cloudflare qui passent toujours en dev. `RESEND_API_KEY` peut rester vide : l'envoi d'email se court-circuite silencieusement et n'est pas bloquant.

## 🧪 Première utilisation

Le `seed.sql` fourni initialise une société d'exemple et quelques utilisateurs. Pour te connecter, récupère un token magique en DB :

```bash
npx wrangler d1 execute give-your-point-eu --local --persist-to=./db_data \
  --command="SELECT name, token FROM users WHERE role IN ('admin','superadmin','owner');"
```

Puis ouvre `http://localhost:8788/login/<token>`.

Tu peux aussi tester l'onboarding autonome : vide ton `localStorage` (ou ouvre une fenêtre privée) et va sur `http://localhost:8788/`.

## 📦 Structure

```
public/
  index.html       # Interface principale + landing onboarding (+ bloc SEO statique)
  about.html       # Page À propos publique (présentation, rôles, RGPD)
  admin.html       # Console admin d'équipe (users, badges, gages, invitations)
  superadmin.html  # Console superadmin (équipes, admins)
  owner.html       # Console owner (vue globale des sociétés + entonnoir)
  stats.html       # Tableaux de bord
  i18n.js          # Dictionnaire FR/EN + helpers t(), setLang()
  app.js           # Logique frontend (auth, points, UI, push, invitation, lien perdu)
  sw.js            # Service worker (push + PWA)
  manifest.json    # PWA installable (+ icon.svg, icon-192.png, icon-512.png)
  robots.txt, sitemap.xml   # SEO
functions/
  [[path]].ts      # Routes API (Hono)
migrations/        # Migrations SQL versionnées (non suivies par git, jouées via Wrangler)
schema.sql         # Schéma de référence
init_db.sql        # Idem (utilisé par db:init)
seed.sql           # Données initiales locales
wrangler.toml      # Config Cloudflare D1
.dev.vars          # Secrets locaux (gitignored)
```

## 🗂️ Tables principales

| Table | Rôle |
|---|---|
| `companies`, `teams` | Hiérarchie société → équipe (`teams.invite_code` = lien d'auto-inscription) |
| `users` | Membres (`role`, `locale`, `email` **unique**, `email_verified`) |
| `categories` | Badges, scope équipe |
| `dare_rules`, `dare_log` | Règles et historique des gages |
| `points_log` | Tous les points distribués (+ `reason` optionnelle) |
| `push_subscriptions` | Abonnements WebPush |
| `analytics_events` | Entonnoir d'acquisition (mesure cookieless) |

## 📜 Scripts npm

```bash
npm run dev      # Build + serveur local (port 8788)
npm run deploy   # Build + déploiement Cloudflare Pages

npm run db:reset # Recrée la base locale (init + seed)
npm run db:pull  # Synchronise la prod vers le local
```

## 🌍 Déploiement

Cloudflare Pages est **connecté au dépôt GitHub** : tout `git push` sur `main` déclenche un build + déploiement automatique en production (`give-your-point.pages.dev`, `donnetonpoint.fr`, `donnetonpoint.fr` — le domaine principal).

```bash
# Si une migration DB est nécessaire, l'appliquer AVANT le push (sinon le code peut planter) :
npm run db:migrate:<nom>
git push
```

`npm run deploy` (`build` + `wrangler pages deploy`) reste possible pour un déploiement manuel hors GitHub. Les variables de prod se configurent dans le dashboard Cloudflare Pages > Settings > Environment variables (VAPID, Turnstile, Resend, **`CRON_SECRET`** pour le digest).

## 📄 Licence

Projet personnel — utilisation libre pour des équipes amicales.
