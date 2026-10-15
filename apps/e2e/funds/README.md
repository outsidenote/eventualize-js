# Funds E2E demo

A small funds service that shows the full outbox pipeline:

```
HTTP command ─► stream.store() ─► Postgres events + outbox
                                       │
                                       ├─ Debezium CDC ─► Kafka ─► risk service
                                       └─ trigger ─► pg-boss ─► leaderboard (MongoDB)
```

Traces from every step go through an OTel collector to the Aspire dashboard.
Design: [`spec/PRDs/e2e-sample.prd.md`](../../../spec/PRDs/e2e-sample.prd.md).

## Run

From the repo root:

```bash
pnpm install && pnpm build
docker compose -f apps/e2e/funds/docker-compose.yml up -d
curl -X POST -H "Content-Type: application/json" \
  --data @apps/e2e/funds/infrastructure/debezium-connector.json \
  http://localhost:8083/connectors     # register the CDC connector once
pnpm --filter e2e-funds start          # main, risk and catalog servers
```

## Services

| Service | Port | Notes |
|---------|------|-------|
| Main API | 3014 | `POST /api/funds/deposit`, `POST /api/funds/withdraw`, `GET /api/funds/leaderboard`, `/openapi.json`, `/asyncapi.json` |
| Risk service | 3013 | Kafka consumer |
| Catalog UI | 3099 | OpenAPI and AsyncAPI docs of all services |
| Postgres | 5434 | user `funds`, db `funds`, logical WAL for Debezium |
| Kafka | 9092 | |
| Debezium Connect | 8083 | |
| MongoDB | 27017 | Leaderboard read model |
| Aspire dashboard | 18888 | Traces and logs |
| OTel collector | 4317 / 4318 | OTLP gRPC / HTTP |

## Code layout

`src/BusinessCapabilities/Funds/` holds one folder per slice in `slices/`
(`DepositFunds`, `WithdrawFunds`, `AccountLeaderboard`, `RiskAssessment`) and the
funds stream in `swimlanes/Funds`.
