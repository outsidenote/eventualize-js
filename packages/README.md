# Eventualize JS

A TypeScript event-sourcing library with multiple storage adapters.

## Packages

| Package | Description |
|---------|-------------|
| `@eventualize/types` | Shared type definitions |
| `@eventualize/core` | Core event-sourcing library |
| `@eventualize/relational-storage-adapter` | Base adapter for relational databases |
| `@eventualize/postgres-storage-adapter` | PostgreSQL storage adapter |
| `@eventualize/mysql-storage-adapter` | MySQL/MariaDB storage adapter |
| `@eventualize/dynamodb-storage-adapter` | DynamoDB storage adapter |

## Replay: inspect a stream at a past offset

`goToOffset` opens a **read-only** stream positioned on a stored event. Views
start from the latest snapshot at or before that offset and fold forward. The
stream cannot append or store.

```ts
const stream = await PointsStreamFactory.goToOffset(
  "points-1", // stream id
  15,         // offset to position on
  storageAdapter,
  snapshotAdapter, // optional; without it views fold from their default state
  100,             // optional page size
);

stream.event;    // the stored event at offset 15
stream.views;    // view states after that event
stream.messages; // outbox messages recomputed for that event (not the stored outbox)

while (!stream.isHead) {
  await stream.forward(); // mutates `stream` and returns it
}
```

Navigation is forward-only (see [ADR 0001](../docs/adr/0001-replay-forward-only-navigation.md)).
To go back, call `goToOffset` again with a smaller offset.

Full guide: [docs/REPLAY.md](../docs/REPLAY.md).

## Replay: clone a stream

`clone` copies a stream, up to an offset, into a new **empty** stream of the
same type. Use it to fix or redact data, to make a sandbox copy, or to migrate
old event shapes.

```ts
const copy = await PointsStreamFactory.clone("points-1", "points-1-copy", storageAdapter, snapshotAdapter, {
  offsetLimit: 15, // optional, inclusive; default: the source head
  pageSize: 100, // optional; source events read per page, default 100
  projectEvent: (e) => (e.eventType === "PointsMultiplied" ? undefined : e), // change or drop events
  projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`), // optional; default: no messages
});
```

- Copied events keep their `capturedAt` and `capturedBy` unless `projectEvent` overrides them.
- By default the clone writes no outbox messages (the producer is not called).
- Target offsets start at 0 and have no gaps, so they can differ from source offsets
  (a source that starts at offset 1, or events dropped by `projectEvent`).
- Writes are stored per page, and earlier when pending events + messages reach 100
  (the DynamoDB transaction limit).
- The target must be empty. A failure throws `EvDbCloneError` with `lastSourceOffset`
  (last source offset fully handled) and `targetStoredOffset`; what was stored before the
  failure stays in the target.

```ts
import EvDbCloneError from "@eventualize/core/store/EvDbCloneError";

try {
  await PointsStreamFactory.clone("points-1", "points-1-copy", storageAdapter, snapshotAdapter);
} catch (err) {
  if (err instanceof EvDbCloneError) {
    console.error(err.lastSourceOffset, err.targetStoredOffset, err.cause);
  }
}
```

Full guide, options, recipes and limits: [docs/REPLAY.md](../docs/REPLAY.md#2-copy-a-stream--clone).

## Prerequisites

- Node.js (with native test runner support)
- pnpm (this repo is a pnpm workspace — npm and yarn are blocked)
- Docker (for integration tests)

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build
```

## Running Tests

### Unit Tests

```bash
pnpm run test:unit
```

### Integration Tests

Integration tests require database services. You can run them using either **Docker Compose** (manual) or **Testcontainers** (automatic).

#### Option 1: Docker Compose

Start the local databases, run tests, then stop:

```bash
# Start databases (MySQL, PostgreSQL, DynamoDB Local)
docker compose up -d

# Run all integration tests
pnpm run test:integration

# Stop databases when done
pnpm run stop-local-dbs
```

#### Option 2: Per-database Tests

Run integration tests against a specific database:

```bash
pnpm run test:mysql
pnpm run test:postgres
pnpm run test:dynamodb
```

### All Tests

Run both unit and integration tests:

```bash
pnpm test
```

## Environment Configuration

Copy `.env.example` to `.env` and adjust values as needed.

Default connection strings for local Docker services:

| Service    | URL                                                |
|------------|----------------------------------------------------|
| MySQL      | `mariadb://evdb:evdbpassword@localhost:3306/evdb_test` |
| PostgreSQL | `postgres://evdb:evdbpassword@localhost:5432/evdb_test` |
| DynamoDB   | `http://localhost:8000`                            |

## Build Commands

```bash
pnpm run build          # Build all packages
pnpm run clean          # Remove root build info
pnpm run clear          # Clean all workspaces
pnpm run rebuild        # Full clean + rebuild
```

## License

MIT
