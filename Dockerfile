# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/crm/package.json apps/crm/package.json
COPY apps/backoffice/package.json apps/backoffice/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api-contract/package.json packages/api-contract/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS source
COPY . .

FROM source AS api-builder
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm --filter api exec prisma generate
RUN pnpm --filter api build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter api --prod deploy --legacy /api-deploy
# Prisma Client is generated beside its pnpm package instance. `pnpm deploy`
# copies the package but not this generated artifact, so retain it explicitly
# in the matching production package directory.
RUN set -eu; \
    prisma_client_source="$(find /workspace/node_modules/.pnpm -type d -path '*/node_modules/.prisma' -print -quit)"; \
    prisma_client_target="$(find /api-deploy/node_modules/.pnpm -type d -path '*/node_modules/@prisma/client' -print -quit | sed 's|/@prisma/client$||')"; \
    test -n "$prisma_client_source"; \
    test -n "$prisma_client_target"; \
    cp -a "$prisma_client_source" "$prisma_client_target/.prisma"

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS api
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /workspace
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates dumb-init openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=api-builder --chown=node:node /api-deploy ./apps/api
COPY --chown=node:node deploy/api/entrypoint.sh /usr/local/bin/gidravlika-api-entrypoint
COPY --chown=node:node deploy/api/migrate.sh /usr/local/bin/gidravlika-migrate
RUN chmod 0755 /usr/local/bin/gidravlika-api-entrypoint /usr/local/bin/gidravlika-migrate
USER node
EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/gidravlika-api-entrypoint"]

FROM source AS next-builder
ARG APP
ARG APP_ENV=production
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ARG S3_PUBLIC_URL
ARG S3_ALLOW_LOCAL_IP=false
ARG BACKOFFICE_ORIGIN
ENV APP_ENV=$APP_ENV
ENV API_URL=$API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ENV S3_PUBLIC_URL=$S3_PUBLIC_URL
ENV S3_ALLOW_LOCAL_IP=$S3_ALLOW_LOCAL_IP
ENV BACKOFFICE_ORIGIN=$BACKOFFICE_ORIGIN
RUN test "$APP" = "web" || test "$APP" = "crm" || test "$APP" = "backoffice"
RUN --mount=type=secret,id=catalog_revalidation_secret,required=false \
    if [ "$APP" = "web" ]; then \
      test -s /run/secrets/catalog_revalidation_secret; \
      export CATALOG_REVALIDATION_SECRET="$(cat /run/secrets/catalog_revalidation_secret)"; \
    fi; \
    pnpm --filter "$APP" build
RUN mkdir -p "/output/apps/$APP/.next" \
    && cp -a "apps/$APP/.next/standalone/." /output/ \
    && cp -a "apps/$APP/.next/static" "/output/apps/$APP/.next/static" \
    && cp -a "apps/$APP/public" "/output/apps/$APP/public"

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS next
ARG APP
ENV APP_NAME=$APP
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /workspace
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*
COPY --from=next-builder --chown=node:node /output ./
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
# exec: node must be dumb-init's direct child, or it exits with the shell on SIGTERM.
CMD ["sh", "-c", "exec node apps/$APP_NAME/server.js"]
