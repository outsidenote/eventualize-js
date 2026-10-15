# Build context: repo root.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter playground-frontend...
RUN pnpm --filter playground-frontend build

FROM nginx:stable-alpine
COPY apps/playground/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/playground/frontend/dist /usr/share/nginx/html
EXPOSE 8080
