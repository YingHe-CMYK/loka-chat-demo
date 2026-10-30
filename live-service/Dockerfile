FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.js ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8780 DATABASE_PATH=/app/data/loka.sqlite
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY server ./server
RUN mkdir /app/data && chown -R node:node /app
USER node
EXPOSE 8780
CMD ["node","server/index.mjs"]
