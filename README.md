# EduManage Africa

Plateforme SaaS multitenant de gestion des établissements d'enseignement en Afrique — voir le cahier des charges complet dans [prompt_dbs_edu_africa.txt](prompt_dbs_edu_africa.txt) et le résumé d'architecture dans [docs/architecture.md](docs/architecture.md).

## Prérequis

- Node.js ≥ 20 (voir [.nvmrc](.nvmrc))
- pnpm 9 (`corepack enable` puis `corepack prepare pnpm@9 --activate`, ou `corepack pnpm <commande>` si l'activation globale échoue faute de droits admin)
- Docker (pour PostgreSQL et Redis en local)

## Démarrage

```bash
pnpm install

# Base de données + cache en local (crée aussi le rôle applicatif edumanage_app,
# voir docker/init-db/01-create-app-role.sh)
cp docker/.env.example docker/.env    # ajuster APP_ROLE_PASSWORD
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d

# Copier les variables d'environnement
cp .env.example .env                  # connexion superuser, pour les migrations
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
# Aligner APP_ROLE_PASSWORD dans apps/api/.env et apps/worker/.env avec docker/.env
# Générer des secrets JWT dans apps/api/.env : openssl rand -base64 48

pnpm db:migrate:dev   # applique les migrations, y compris les policies RLS
pnpm db:seed          # pays, devises, rôles/permissions, plans d'abonnement

pnpm dev
```

L'API et le worker se connectent avec le rôle `edumanage_app` (privilèges DML seuls, sans `BYPASSRLS`) — jamais avec le superuser Postgres, sans quoi la Row-Level Security serait silencieusement ignorée. Détail dans [docs/architecture.md](docs/architecture.md#stratégie-multitenant-implémentée-phase-2).

- Web : http://localhost:5173
- API : http://localhost:4000/api/v1/health

## Structure du monorepo

```
apps/web       Site public + portails (React/Vite/TS)
apps/api       API REST (Express/TS)
apps/worker    Traitements asynchrones (BullMQ)
packages/ui           Composants React partagés
packages/types         Types TS partagés
packages/config        Config runtime + validation Zod des variables d'env
packages/validation     Schémas Zod partagés front/back
packages/i18n           Traductions fr (défaut) / en
packages/eslint-config  Config ESLint partagée (flat config)
packages/tsconfig       tsconfig de base partagés
prisma/schema/          Schéma Prisma multi-fichiers (88 modèles) + migrations
prisma/seed/            Script de seed (pays, devises, rôles, plans)
docker/                 Docker Compose (Postgres + Redis, dev) + init du rôle applicatif
docs/                   Documentation d'architecture
```

## Scripts racine

| Commande              | Effet                                         |
| --------------------- | --------------------------------------------- |
| `pnpm dev`            | Lance web/api/worker en parallèle (Turborepo) |
| `pnpm build`          | Build tous les packages/apps                  |
| `pnpm lint`           | ESLint sur tout le monorepo                   |
| `pnpm typecheck`      | Vérification TypeScript stricte               |
| `pnpm test`           | Tests (Vitest)                                |
| `pnpm db:generate`    | Génère le client Prisma                       |
| `pnpm db:migrate:dev` | Applique une migration Prisma en dev          |
| `pnpm db:seed`        | Peuple pays/devises/rôles/permissions/plans   |
| `pnpm format`         | Formatage Prettier                            |

## État du projet

Phases 1 à 6 terminées : Fondation, Données et sécurité (schéma Prisma complet, authentification, RBAC, isolation multitenant testée), Abonnements (machine à états, paiement espèces de bout en bout, architecture webhook Mobile Money), Site public (accueil, tarifs, contact, pages légales, assistant d'inscription établissement — vérifié de bout en bout contre l'API réelle), Gestion de l'établissement (configuration, utilisateurs, personnel, élèves et inscriptions, documents, détection de doublons, transferts inter-établissements, import/export CSV, cartes scolaires), Gestion académique (programmes, coefficients, affectations des enseignants, emplois du temps ; notes — saisie/verrouillage/correction, moyennes pondérées, classement, bulletins PDF ; présences — appel par classe, justification d'absence ; discipline — incidents, sanctions, historique). Phase 7 (Gestion financière) démarrée : catégories de frais, grilles tarifaires et cycle de vie de la facture élève faits ; encaissement, reçus, caisse, dépenses et rapports restent à faire. Rattachement parent/élève et notification des parents renvoyés à la Phase 8. Voir [docs/architecture.md](docs/architecture.md#phases-de-développement) pour le détail des phases et ce qui reste à faire.
