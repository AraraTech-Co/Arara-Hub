# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public
ENV DATABASE_URL=${DATABASE_URL}

RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4100
ENV HOST=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 arara \
    && useradd --system --uid 1001 --gid arara arara

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma CLI isolado com deps completas (effect, @prisma/config, …) para migrate deploy.
RUN mkdir -p /opt/prisma-cli && cd /opt/prisma-cli && npm init -y && npm install prisma@6.9.0 && npm cache clean --force
ENV PATH="/opt/prisma-cli/node_modules/.bin:${PATH}"

COPY prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY scripts/static-host.mjs ./scripts/static-host.mjs

RUN mkdir -p /app/data/hosting && chown -R arara:arara /app

USER arara
EXPOSE 4100
# App hosting sticky ports (one per app); publish a range in compose.
EXPOSE 10000-10050

CMD ["node", "dist/src/server.js"]
