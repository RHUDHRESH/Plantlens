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
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
