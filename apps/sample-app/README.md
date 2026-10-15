# Sample app

Two example streams, and the integration test suite that runs them against
PostgreSQL, MySQL and DynamoDB.

## Streams

| Stream | Shows |
|--------|-------|
| [`PointsStream`](src/eventstore/PointsStream) | Events, two views, outbox messages. One file per event and per view. |
| [`FundsStream`](src/eventstore/FundsStream) | A richer domain. `FundsPureEventsStreamFactory` has events only. |

## Tests

| File | What |
|------|------|
| `src/tests/unit.test.ts` | No database |
| `src/tests/integration.test.ts` | Store and load, OCC, trace context, paging, snapshots, replay, clone, on each database |
| `src/tests/api.integration.test.ts` | Pure-event streams, views, and `withMessages` output, on each database |
| `src/tests/TestContainerManager/` | Starts databases with Testcontainers and creates tables |

Run from the repo root:

```bash
pnpm test:unit
pnpm test:postgres     # or test:mysql, test:dynamodb
```

`TEST_CONTAINER=true` (set by these scripts) starts the databases in Docker.
Without it, the tests use the connection strings in `.env.test`; start the
databases yourself with `docker compose up -d`. `TEST_DATABASES` picks the
databases: a comma-separated list of `Postgres`, `MySQL`, `DynamoDB`.
