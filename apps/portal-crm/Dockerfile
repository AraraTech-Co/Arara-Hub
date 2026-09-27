# syntax=docker/dockerfile:1
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

# Build args (DATABASE_URL necessário para Prisma durante o build)
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION
ARG DATABASE_URL

ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL é obrigatório para Prisma (generate + análise de rotas durante build)
ENV DATABASE_URL=${DATABASE_URL:-postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public}

# Carrega variáveis do env.build (criado pelo workflow; sobrescreve ENV acima)
RUN if [ -f env.build ]; then cp env.build .env; fi

RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/package.json ./
USER root
# Prisma CLI isolado em /opt com todas as suas deps (migration engine + transitivas
# que o build standalone do Next.js não traz). O symlink expõe `prisma/config` para o
# prisma.config.ts (resolvido a partir de /app); o PATH expõe o binário `prisma` para o
# step de migration do deploy.yml. O runtime do app usa o node_modules do standalone.
RUN mkdir -p /opt/prisma-cli && cd /opt/prisma-cli && npm init -y && npm install prisma@7.8.0 && npm cache clean --force \
  && ln -sf /opt/prisma-cli/node_modules/prisma /app/node_modules/prisma
ENV PATH="/opt/prisma-cli/node_modules/.bin:${PATH}"
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
