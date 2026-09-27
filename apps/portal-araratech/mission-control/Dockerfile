FROM node:20-alpine as base

ARG AWS_ACCESS_KEY
ARG AWS_SECRET_ACCESS_KEY
ARG AWS_REGION
ARG AWS_BUCKET
ARG APP_NAME
ARG PORT
ARG CLIENT_URL
ARG MISSION_CONTROL_CLIENT
ARG PRODUCTION_DOMAIN
ARG STAGING_DOMAIN
ARG ADMIN_DOMAIN
ARG STAGING_ADMIN_DOMAIN
ARG SLACK_ERRORS_WEBHOOK
ARG POSTMARK_API_KEY
ARG DB_USER
ARG DB_PASSWORD
ARG DB_HOST
ARG DB_NAME
ARG DB_PROVIDER
ARG SESSION_SECRET
ARG TOKEN_SECRET
ARG CRYPTO_SECRET
ARG SUPPORT_EMAIL
ARG STRIPE_SECRET_API_KEY
ARG SSH_PRIVATE_KEY
ARG NODE_ENV

ENV AWS_ACCESS_KEY=${AWS_ACCESS_KEY} \
  AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
  AWS_REGION=${AWS_REGION} \
  AWS_BUCKET=${AWS_BUCKET} \
  APP_NAME=${APP_NAME} \
  PORT=${PORT} \
  CLIENT_URL=${CLIENT_URL} \
  MISSION_CONTROL_CLIENT=${MISSION_CONTROL_CLIENT} \
  PRODUCTION_DOMAIN=${PRODUCTION_DOMAIN} \
  STAGING_DOMAIN=${STAGING_DOMAIN} \
  ADMIN_DOMAIN=${ADMIN_DOMAIN} \
  STAGING_ADMIN_DOMAIN=${STAGING_ADMIN_DOMAIN} \
  SLACK_ERRORS_WEBHOOK=${SLACK_ERRORS_WEBHOOK} \
  POSTMARK_API_KEY=${POSTMARK_API_KEY} \
  DB_USER=${DB_USER} \
  DB_PASSWORD=${DB_PASSWORD} \
  DB_HOST=${DB_HOST} \
  DB_NAME=${DB_NAME} \
  DB_PROVIDER=${DB_PROVIDER} \
  SESSION_SECRET=${SESSION_SECRET} \
  TOKEN_SECRET=${TOKEN_SECRET} \
  CRYPTO_SECRET=${CRYPTO_SECRET} \
  SUPPORT_EMAIL=${SUPPORT_EMAIL} \
  STRIPE_SECRET_API_KEY=${STRIPE_SECRET_API_KEY} \
  SSH_PRIVATE_KEY=${SSH_PRIVATE_KEY} \
  NODE_ENV=${NODE_ENV}

FROM base AS build 
WORKDIR /mission-control
COPY ./mission-control/package*.json .
RUN npm i
COPY ./mission-control .
RUN npm run build
WORKDIR /mission-control/client
RUN npm i --force
RUN npm run build:css
RUN npm run build

FROM base AS production
ARG PORT
ENV PORT=${PORT}
WORKDIR /app
COPY --from=build /mission-control/dist/ /app/dist
COPY --from=build /mission-control/package*.json /app/
COPY --from=build /mission-control/client/build /app/dist/client/build
COPY ./mission-control/config /app/config
RUN npm ci --production
EXPOSE ${PORT}
CMD ["npm", "run", "node"]

FROM base as development
WORKDIR /usr/src/app
COPY ./package.json ./package-lock.json ./
RUN npm install --ignore-scripts
COPY ./prisma ./prisma
WORKDIR /usr/src/app/mission-control
COPY ./mission-control/package*.json ./
RUN npm install
COPY ./mission-control .
RUN npx prisma generate --schema=../prisma/schema.prisma --generator missionControlClient
CMD ["sh", "-c", "npx prisma generate --schema=../prisma/schema.prisma --generator missionControlClient && npm run server"]
