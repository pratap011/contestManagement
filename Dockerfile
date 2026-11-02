# Build the Vue app, then serve it and the API from one Node process.
FROM node:24-bookworm-slim AS web-build
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN npm ci --prefix apps/web --no-audit --no-fund
COPY apps/web ./apps/web
RUN npm --prefix apps/web run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY --from=web-build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.ts"]
