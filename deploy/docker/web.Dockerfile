# PlantLens web image (Vite build → nginx). Build context = repo root.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml /app/
COPY apps/web/package.json /app/apps/web/
COPY packages /app/packages
RUN pnpm install --frozen-lockfile --filter @plantlens/web...
COPY apps/web /app/apps/web
RUN pnpm --filter @plantlens/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# TODO(you): add an nginx.conf that proxies /api and /ws to the api service in compose.
EXPOSE 80
