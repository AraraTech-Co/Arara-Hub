FROM node:22-alpine
WORKDIR /usr/src/app/mission-control/client
COPY ./mission-control/client/package*.json ./
RUN npm install --force
COPY ./mission-control/client .
CMD ["npm", "start", "--loglevel=verbose"]
