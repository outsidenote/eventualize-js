# Build context: repo root (workspace packages resolve from it).
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec tsc --build apps/playground/backend
RUN pnpm deploy --filter playground-backend --prod --legacy /out

# Applies the Prisma migrations of the Postgres adapter.
FROM build AS migrate
WORKDIR /repo/packages/adapters/postgres-storage-adapter
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
