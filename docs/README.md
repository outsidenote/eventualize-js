# Documentation

Pick the page by what you need right now.

## Learn (tutorial)

- [Getting started](getting-started.md): build a points ledger on PostgreSQL,
  step by step.

## Do a task (how-to guides)

- [Storage adapters](guides/storage-adapters.md): connect PostgreSQL, MySQL or
  DynamoDB, create the tables, write a new adapter.
- [Replay](guides/replay.md): open a read-only stream at a past offset with
  `goToOffset`, and step forward.
- [Snapshots](guides/snapshots.md): choose when each view stores a snapshot
  (offset gap, time gap, specific events).
- [Clone](guides/clone.md): copy a stream into a new one with `clone` (fix or
  redact data, sandbox, migrate event shapes).
- [Outbox delivery](guides/outbox.md): send outbox messages to pg-boss workers,
  or to Kafka with Debezium CDC.
- [OpenTelemetry](guides/opentelemetry.md): export spans, choose which spans to
  produce, add custom spans, carry trace context through a queue.

## Understand (explanation)

- [Concepts](concepts.md): streams, events, views, snapshots, outbox messages,
  optimistic concurrency.
- [ADR 0001: replay is forward-only](adr/0001-replay-forward-only-navigation.md)
- [ADR 0002: span filtering per stream factory](adr/0002-span-filtering-per-stream-factory.md)
- [ADR 0003: per-view snapshot strategy](adr/0003-per-view-snapshot-strategy.md)
- [OpenTelemetry API design](design/otel-api-design.md) and
  [PRD](design/otel-prd.md)

## Look up (reference)

- Package READMEs: [core](../packages/core), [types](../packages/types),
  [relational](../packages/adapters/relational-storage-adapter),
  [postgres](../packages/adapters/postgres-storage-adapter),
  [mysql](../packages/adapters/mysql-storage-adapter),
  [dynamodb](../packages/adapters/dynamodb-storage-adapter),
  [eslint-plugin](../packages/eslint-plugin)
- Changelogs: `CHANGELOG.md` in each package folder.

## For contributors

- [CONTRIBUTING.md](../CONTRIBUTING.md): setup, tests, changesets, releases.
- [AGENTS.md](../AGENTS.md): commands, conventions and gotchas, for coding
  agents and humans.
- `docs/superpowers/` and `spec/`: working plans and specs from past features.
  They record intent at the time and may be out of date. The code and the docs
  above win.
