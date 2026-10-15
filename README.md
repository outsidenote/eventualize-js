# eventualize-js

Type-safe event sourcing for TypeScript, with storage adapters for PostgreSQL,
MySQL and DynamoDB.

[![CI](https://github.com/outsidenote/eventualize-js/actions/workflows/ci.yml/badge.svg)](https://github.com/outsidenote/eventualize-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@eventualize/core?label=%40eventualize%2Fcore)](https://www.npmjs.com/package/@eventualize/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

- **Typed streams.** Declare events and views once. You get typed
  `appendEvent<Name>()` methods and typed view state, checked at compile time.
- **Views and snapshots.** Views fold events into state. Snapshots make loading fast.
- **Transactional outbox.** Messages are stored in the same transaction as the
  events that produced them.
- **Optimistic concurrency.** Two writers on one stream cannot both win.
- **Replay.** Open a read-only stream at any past offset and step forward.
- **Clone.** Copy a stream into a new one, changing or dropping events on the way.
- **OpenTelemetry built in.** Spans and W3C trace context, with no setup in the
  library.

## Install

```bash
pnpm add @eventualize/core @eventualize/types @opentelemetry/api
# then one storage adapter:
pnpm add @eventualize/postgres-storage-adapter @eventualize/relational-storage-adapter
```

| Database | Packages |
|----------|----------|
| PostgreSQL | `@eventualize/postgres-storage-adapter` + `@eventualize/relational-storage-adapter` |
| MySQL / MariaDB | `@eventualize/mysql-storage-adapter` + `@eventualize/relational-storage-adapter` |
| DynamoDB | `@eventualize/dynamodb-storage-adapter` + `@aws-sdk/client-dynamodb` |

The database needs tables first. See [Storage adapters](docs/guides/storage-adapters.md).

## Quick start

```ts
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

type PointsAdded = { readonly points: number };
type PointsSubtracted = { readonly points: number };

// 1. Declare the stream: its events and its views.
const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withEvent("PointsSubtracted")
  .asType<PointsSubtracted>()
  .withView("Sum", { sum: 0 }, {
    PointsAdded: (state, event) => ({ sum: state.sum + event.points }),
    PointsSubtracted: (state, event) => ({ sum: state.sum - event.points }),
  })
  .build();

// 2. Connect to storage. One adapter stores events and snapshots.
const client = EvDbPostgresPrismaClientFactory.create(process.env.POSTGRES_CONNECTION);
const storage = new EvDbPrismaStorageAdapter(client);

// 3. Load a stream, append events, store.
const stream = await PointsStreamFactory.get("user-1", storage, storage);
await stream.appendEventPointsAdded({ points: 50 });
await stream.appendEventPointsSubtracted({ points: 20 });
await stream.store();

console.log(stream.views.Sum.sum); // 30
```

Next: the [Getting started tutorial](docs/getting-started.md) builds this step
by step, with messages and tests.

## Documentation

| I want to... | Read |
|--------------|------|
| Learn the library from zero | [Getting started](docs/getting-started.md) |
| Understand streams, views, snapshots, messages | [Concepts](docs/concepts.md) |
| Set up a database | [Storage adapters](docs/guides/storage-adapters.md) |
| Send outbox messages to workers or Kafka (pg-boss, Debezium) | [Outbox delivery](docs/guides/outbox.md) |
| Look at a stream's state at a past offset | [Replay](docs/guides/replay.md) |
| Copy a stream to fix data, sandbox or migrate | [Clone](docs/guides/clone.md) |
| Send traces to my backend | [OpenTelemetry](docs/guides/opentelemetry.md) |
| See every doc | [Docs index](docs/README.md) |

## Packages

| Package | What it does |
|---------|--------------|
| [`@eventualize/core`](packages/core) | Stream factory builder, streams, views, replay, clone, OTel helpers |
| [`@eventualize/types`](packages/types) | Shared types: events, messages, cursors, adapter interfaces |
| [`@eventualize/relational-storage-adapter`](packages/adapters/relational-storage-adapter) | Prisma storage adapter for SQL databases |
| [`@eventualize/postgres-storage-adapter`](packages/adapters/postgres-storage-adapter) | PostgreSQL Prisma client factory |
| [`@eventualize/mysql-storage-adapter`](packages/adapters/mysql-storage-adapter) | MySQL / MariaDB Prisma client factory |
| [`@eventualize/dynamodb-storage-adapter`](packages/adapters/dynamodb-storage-adapter) | DynamoDB storage adapter |
| [`@eventualize/eslint-plugin`](packages/eslint-plugin) | Lint rule for stream factory modules |

## Examples

| App | Shows |
|-----|-------|
| [`apps/sample-app`](apps/sample-app) | Sample streams, and the integration tests for all three databases |
| [`apps/otel-sample-app`](apps/otel-sample-app) | Traces exported to an OTel collector |
| [`apps/e2e/funds`](apps/e2e/funds) | Outbox → Debezium CDC → Kafka → read models |
| [`apps/playground`](apps/playground) | UI to step through a stream's history |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Coding agents: see [AGENTS.md](AGENTS.md).
Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
