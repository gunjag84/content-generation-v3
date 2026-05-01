FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/functions/package.json ./server/functions/
RUN pnpm install --frozen-lockfile --prod --filter content-generation-v3

FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/functions/package.json ./server/functions/
RUN pnpm install --frozen-lockfile --filter content-generation-v3
COPY tsconfig.base.json tsconfig.server.json ./
COPY server ./server
COPY shared ./shared
RUN pnpm exec tsc -p tsconfig.server.json

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Phase 3: Playwright Chromium for /internal/render
# --with-deps installs OS libs (libnss, fonts, etc.) needed by headless Chromium.
RUN node_modules/.bin/playwright install --with-deps chromium

EXPOSE 8080
CMD ["node", "dist/server/index.js"]
