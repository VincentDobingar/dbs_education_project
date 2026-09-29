# syntax=docker/dockerfile:1.7
#
# Image de production, contexte de build = racine du dépôt (voir docker-compose.prod.yml).
# Trois cibles partageant le même étage `deps` (installation pnpm faite une seule fois) :
#   --target api     API Express (+ CLI prisma pour `migrate deploy`)
#   --target worker  worker BullMQ
#   --target web     frontend Vite servi par nginx
#
# Les packages du workspace (@edumanage/config, types, validation…) exposent leur
# source TypeScript (`main: ./src/index.ts`, imports en `.js`) : `node dist/index.js`
# ne peut pas les résoudre. L'API et le worker s'exécutent donc via `tsx`, comme en dev.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    npm_config_store_dir=/pnpm/store \
    HUSKY=0
# openssl : requis par le moteur de requêtes Prisma (absent de l'image slim).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /repo

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/i18n/package.json packages/i18n/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY prisma/schema prisma/schema
RUN node_modules/.bin/prisma generate --schema=prisma/schema

# ---------------------------------------------------------------- sources
FROM deps AS sources
COPY packages packages
COPY apps apps
COPY prisma prisma

# ---------------------------------------------------------------- api
FROM sources AS api
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/data/uploads
# Dossier des fichiers téléversés (logos…) : monté en volume nommé, doit
# appartenir à l'utilisateur non-root pour que le volume hérite des droits.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]

# ---------------------------------------------------------------- worker
FROM sources AS worker
ENV NODE_ENV=production
USER node
WORKDIR /repo/apps/worker
CMD ["node", "--import", "tsx", "src/index.ts"]

# ---------------------------------------------------------------- web (build)
FROM sources AS web-build
# Inlinée dans le bundle au build (import.meta.env) : changer l'URL de l'API
# impose de reconstruire cette image.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @edumanage/web build

# ---------------------------------------------------------------- web
FROM nginx:1.27-alpine AS web
COPY docker/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
