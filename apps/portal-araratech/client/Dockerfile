FROM node:22-alpine

WORKDIR /usr/src/app/client
COPY ./client/package*.json ./
RUN npm install --force
COPY ./client .
CMD ["npm", "start", "--loglevel=verbose"]
