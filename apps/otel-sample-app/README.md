# OTel sample app

Appends `FundsStream` events to Postgres and exports traces, metrics and logs
over OTLP. Use it to see the spans eventualize-js creates.

- [`src/otel.ts`](src/otel.ts): the OTel SDK setup. It is the first import.
- [`src/index.ts`](src/index.ts): creates the tables, then appends and stores events.

## Run

From the repo root:

```bash
pnpm install && pnpm build
docker compose up -d postgres
echo 'POSTGRES_CONNECTION=postgres://evdb:evdbpassword@localhost:5432/evdb_test' > apps/otel-sample-app/.env
pnpm --filter otel-sample-app start
```

Traces go to `http://localhost:4318` (set `OTEL_EXPORTER_OTLP_ENDPOINT` to
change it). To see them, start the collector and Aspire dashboard from
[`apps/e2e/funds`](../e2e/funds) and open http://localhost:18888.

Guide: [docs/guides/opentelemetry.md](../../docs/guides/opentelemetry.md).
