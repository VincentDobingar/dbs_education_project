# EduManage Africa

Plateforme SaaS multitenant de gestion des établissements d'enseignement en Afrique — voir le cahier des charges complet dans [prompt_dbs_edu_africa.txt](prompt_dbs_edu_africa.txt) et le résumé d'architecture dans [docs/architecture.md](docs/architecture.md).

## Prérequis

- Node.js ≥ 20 (voir [.nvmrc](.nvmrc))
- pnpm 9 (`corepack enable` puis `corepack prepare pnpm@9 --activate`, ou `corepack pnpm <commande>` si l'activation globale échoue faute de droits admin)
- Docker (pour PostgreSQL et Redis en local)

## Démarrage

```bash
pnpm install

# Base de données + cache en local
docker compose -f docker/docker-compose.yml up -d

# Copier les variables d'environnement de chaque app
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
# Générer des secrets JWT dans apps/api/.env : openssl rand -base64 48

pnpm db:generate

pnpm dev
```

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
prisma/                 Schéma Prisma, migrations, seeds
docker/                 Docker Compose (Postgres + Redis, dev)
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
| `pnpm format`         | Formatage Prettier                            |

## État du projet

Phase 1 (Fondation) en cours — voir [docs/architecture.md](docs/architecture.md#phases-de-développement) pour le détail des phases et ce qui reste à faire.
