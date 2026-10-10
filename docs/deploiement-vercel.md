# Déploiement du site public + portails (`apps/web`) sur Vercel

Ce document couvre uniquement `apps/web` (site public, portail établissement, portail
famille, portail super-administration) : une SPA Vite/React statique, bien adaptée à
Vercel. L'API, le worker, PostgreSQL et Redis restent sur le VPS Coolify
(voir `docker/docker-compose.prod.yml` et le README) — Vercel ne les héberge pas.

## Pourquoi cette séparation

Vercel excelle pour du contenu statique/SPA avec déploiements instantanés et preview par
PR, mais ses fonctions sont sans état et éphémères : mal adapté à une API qui a besoin
d'une connexion PostgreSQL persistante (RLS, rôle `edumanage_app`) et d'un worker BullMQ
connecté à Redis en continu. Ces deux-là restent sur Coolify ; seul le frontend bouge.

## Configuration déjà en place dans le dépôt

- [`vercel.json`](../vercel.json) (racine du repo) : commande d'installation (`pnpm
install --frozen-lockfile`), commande de build limitée au package web via Turborepo
  (`pnpm turbo run build --filter=@edumanage/web`), dossier de sortie
  (`apps/web/dist`), et une réécriture SPA (`/* → /index.html`) pour que les routes
  React Router (ex. `/admin/connexion`) ne retournent pas 404 au rechargement direct.
- Le monorepo utilise `packageManager: pnpm@9.15.0` dans le `package.json` racine :
  Vercel active `corepack` automatiquement et installera cette version exacte de pnpm.

## Étapes de mise en ligne

1. **Importer le projet sur [vercel.com](https://vercel.com)** à partir du dépôt GitHub
   `dbs_edu_africa` (après le push de cette session). Ne pas changer le « Root
   Directory » du projet Vercel : le laisser à la racine du repo, car `vercel.json`
   pilote déjà le build vers `apps/web/dist`.
2. **Framework Preset** : laisser sur « Other » (le `vercel.json` fournit déjà
   `buildCommand`/`outputDirectory`, aucune détection automatique n'est nécessaire).
3. **Variable d'environnement obligatoire** (Project Settings → Environment Variables) :
   - `VITE_API_URL` = URL publique de l'API Coolify, avec le préfixe de version, par
     exemple `https://api.dbs-edu-africa.org/api/v1`. Elle est inlinée au build (Vite),
     donc toute modification exige un redéploiement.
4. **Node.js Version** (Project Settings → General) : sélectionner 20.x (le projet
   exige `node >= 20.0.0`, voir `package.json` racine et `.nvmrc`).
5. Déployer. Les push sur `master` déclenchent la production ; toute autre branche/PR
   obtient une URL de preview Vercel automatique.

## À faire côté API (Coolify) après le premier déploiement

L'API autorise une seule origine CORS via la variable `WEB_URL` (voir
`docker/docker-compose.prod.yml`, mappée sur `CORS_ORIGIN` dans `apps/api/src/env.ts`).
Une fois l'URL Vercel définitive connue (domaine `*.vercel.app` ou domaine personnalisé
branché dessus) :

1. Mettre à jour `WEB_URL` dans l'environnement Coolify de l'API avec cette URL exacte
   (schéma + hôte, sans slash final — ex. `https://edumanage-africa.vercel.app`).
2. Redéployer/redémarrer le service `api` pour que la nouvelle valeur soit prise en
   compte (elle est lue une fois au démarrage).
3. Si un domaine personnalisé est branché sur Vercel après coup, répéter l'étape 1 avec
   le nouveau domaine.

Tant que `WEB_URL` ne correspond pas exactement à l'origine Vercel, le navigateur
bloquera les appels à l'API (erreur CORS), même si l'API elle-même répond normalement.

## Limite connue

`CORS_ORIGIN`/`WEB_URL` n'accepte qu'une seule origine (correspondance exacte, pas de
liste). Pendant la phase de test sur une URL de preview Vercel temporaire, prévoir de
re-basculer `WEB_URL` vers l'URL de production une fois celle-ci stabilisée plutôt que
de chercher à autoriser plusieurs origines en même temps.
