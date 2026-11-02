FROM node:24-bookworm-slim AS build
WORKDIR /app/live-service
COPY live-service/package*.json ./
RUN npm ci --no-audit --no-fund
COPY live-service/index.html live-service/tsconfig.json live-service/vite.config.js ./
COPY live-service/src ./src
COPY live-service/scripts ./scripts
COPY *.js *.css index.html mirror-loop.html wallet-preview-qr.svg /app/
COPY vendor /app/vendor
RUN npm run build
RUN npm prune --omit=dev
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8780 DATABASE_PATH=/app/data/loka.sqlite
WORKDIR /app
COPY --from=build /app/live-service/node_modules ./node_modules
COPY --from=build /app/live-service/dist ./dist
COPY live-service/package*.json ./
COPY live-service/server ./server
RUN mkdir /app/data && chown -R node:node /app
USER node
EXPOSE 8780
CMD ["node","server/index.mjs"]
