# ── deps ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable pnpm
ARG APP_BASE_PATH=
ENV VITE_APP_BASE_PATH=$APP_BASE_PATH
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── deps de runtime (só o que o migrate.mjs precisa) ──────────────────
FROM node:22-alpine AS runtime-deps
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# ── runtime ───────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

COPY --from=build /app/.output ./.output
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY drizzle ./drizzle
COPY scripts/migrate.mjs ./scripts/migrate.mjs

EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]
