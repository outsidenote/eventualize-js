#!/usr/bin/env bash
# Runs backend (tsx watch) + Vite dev server against the root docker-compose Postgres,
# using a separate "playground" database so test tables are not touched.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"

# Workspace packages resolve from dist/, so build them first.
pnpm build

docker compose up -d --wait postgres
exists="$(docker compose exec -T postgres psql -U evdb -d evdb_test -tAc "SELECT 1 FROM pg_database WHERE datname='playground'")"
[[ "$exists" == "1" ]] || docker compose exec -T postgres createdb -U evdb playground

export POSTGRES_CONNECTION="${POSTGRES_CONNECTION:-postgres://evdb:evdbpassword@localhost:5432/playground}"
pnpm --filter @eventualize/postgres-storage-adapter exec prisma migrate deploy
pnpm --parallel --filter playground-backend --filter playground-frontend run dev
