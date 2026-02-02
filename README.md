# 🎯 Donne Ton Point

Application de gamification interne pour l'équipe.

## 🚀 Installation

**Installer les dépendances**
    `bash`
    `npm install`

**Créer votre fichier d'accès (Seed)**

Créez un fichier nommé seed.sql à la racine du projet (ce fichier est ignoré par Git). Ajoutez-y vos catégories et votre compte administrateur :

    INSERT INTO users (id, name, active, token) VALUES 
    ('admin-id', 'Votre Nom', 1, 'votre-token-secret');

**Configurer le mot de passe Admin**
   Créez un fichier `.dev.vars` à la racine du projet pour le développement local :

   ADMIN_PASSWORD=votre_mot_de_passe_secret

**Injection des données**
    `npx wrangler d1 execute DB --local --file=./init_db.sql`
    `npx wrangler d1 execute DB --local --file=./seed.sql`

**Lancement de l'application**
    `npx wrangler dev`

## 🔑 Accès à l'Admin

1. **Connexion initiale** : Utilisez votre lien magique pour vous identifier (cela enregistre votre token dans le navigateur) :
   `http://localhost:8787/login/votre-token-secret-defini-dans-seed.sql`

2. **Accès au panneau de contrôle** : Une fois connecté, rendez-vous sur la page d'administration :
   `http://localhost:8787/admin`

   Le mot de passe est celui défini dans le fichier `.dev.vars`.

## 🥐 Règle d'or
Un gage en catégorie "Méchanceté" s'efface uniquement avec des viennoiseries.