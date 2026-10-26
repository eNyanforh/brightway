# Version matches the checked Node 24 CI runtime. Resolve image digests when promoting a release.
FROM node:24.22.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY backend backend
COPY frontend frontend
COPY shared shared
RUN cd backend && DIRECT_URL=postgresql://unused:unused@127.0.0.1/unused npx --no-install prisma generate
RUN npm run build

FROM node:24.22.1-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=5000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/backend backend
COPY --from=build --chown=node:node /app/shared shared
COPY --from=build --chown=node:node /app/frontend/package.json frontend/package.json
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
RUN mkdir /state && chown node:node /state
USER node
EXPOSE 5000
CMD ["node", "backend/scripts/start-staging.js"]

# This staging template follows the maintained stable channel; pin its tested digest before promotion.
FROM nginx:stable-alpine AS web
COPY deploy/staging/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
USER nginx
EXPOSE 8443
CMD ["nginx", "-g", "daemon off;"]
