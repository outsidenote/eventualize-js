# Storage adapters

How to connect eventualize-js to PostgreSQL, MySQL or DynamoDB, and how to
create the tables it needs.

Every adapter below implements both `IEvDbStorageStreamAdapter` (events and
outbox messages) and `IEvDbStorageSnapshotAdapter` (snapshots). Pass the same
object as both arguments:

```ts
const stream = await MyStreamFactory.get("id-1", storage, storage);
```

Close the adapter when your app shuts down: `await storage.close()`.

## PostgreSQL

```bash
pnpm add @eventualize/postgres-storage-adapter @eventualize/relational-storage-adapter
```

```ts
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

const client = EvDbPostgresPrismaClientFactory.create("postgres://user:pass@host:5432/db");
const storage = new EvDbPrismaStorageAdapter(client, { kind: "postgres" });
```

`create()` without an argument reads the `POSTGRES_CONNECTION` env var.

### Tables

Three tables: `events`, `outbox`, `snapshot`. Apply the SQL migrations in
[`packages/adapters/postgres-storage-adapter/prisma/migrations`](../../packages/adapters/postgres-storage-adapter/prisma/migrations)
in name order, with your usual migration tool or `psql`. The migrations are not
part of the npm package. The model is in
[`prisma/schema.prisma`](../../packages/adapters/postgres-storage-adapter/prisma/schema.prisma).

## MySQL / MariaDB

```bash
pnpm add @eventualize/mysql-storage-adapter @eventualize/relational-storage-adapter
```

```ts
import EvDbMySqlPrismaClientFactory from "@eventualize/mysql-storage-adapter/EvDbMySqlPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

const client = EvDbMySqlPrismaClientFactory.create("mariadb://user:pass@host:3306/db");
const storage = new EvDbPrismaStorageAdapter(
  client as unknown as ConstructorParameters<typeof EvDbPrismaStorageAdapter>[0],
  { kind: "mysql" },
);
```

- The client uses the MariaDB driver. Use a `mariadb://` URL.
- `create()` without an argument reads the `MYSQL_CONNECTION` env var.
- The cast is needed: the MySQL package has its own generated Prisma client
  type, and the adapter's constructor uses the PostgreSQL one. Both have the same
  shape at runtime.

### Tables

Apply the SQL migrations in
[`packages/adapters/mysql-storage-adapter/prisma/migrations`](../../packages/adapters/mysql-storage-adapter/prisma/migrations)
in name order.

## DynamoDB

```bash
pnpm add @eventualize/dynamodb-storage-adapter @aws-sdk/client-dynamodb
```

Give the adapter your own `DynamoDBClient`. This uses the normal AWS
credential chain (IAM role, profile, env vars):

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import EvDbDynamoDbStorageAdapter from "@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter";

const storage = new EvDbDynamoDbStorageAdapter(new DynamoDBClient({ region: "eu-west-1" }));
```

For local development (for example LocalStack on port 4566), use options:

```ts
const storage = EvDbDynamoDbStorageAdapter.withOptions({
  endpoint: "http://localhost:4566",
  accessKeyId: "local",
  secretAccessKey: "local",
  region: "us-east-1",
});
```

`withOptions()` and `new EvDbDynamoDbStorageAdapter()` (no argument) need an
endpoint, an access key and a secret. Missing values come from
`DYNAMODB_CONNECTION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
`AWS_REGION` (default `us-east-1`). If one is still missing, they throw.

### Tables

| Table | Partition key | Sort key | Notes |
|-------|---------------|----------|-------|
| `events` | `stream_address` (S) | `offset` (N) | GSI `event_type__captured_at` |
| `snapshots` | `view_address` (S) | `offset` (N) | |
| `messages` | `message_address` (S) | `captured_at` (S) | |

Ready-made `CreateTable` inputs are in
[`packages/adapters/dynamodb-storage-adapter/models`](../../packages/adapters/dynamodb-storage-adapter/models):

```bash
for t in events snapshots messages; do
  aws dynamodb create-table --cli-input-json "file://models/$t-table-schema.json"
done
```

A store is one DynamoDB transaction, so one `store()` call can write at most 100
items (events + messages).

## Test helpers: admin classes

`EvDbPrismaStorageAdmin` (relational) and `EvDbDynamoDbAdmin` (DynamoDB) can
delete all rows with `clearEnvironmentAsync()`. Use them in tests only. They do
not create tables.

## Writing a new adapter

Implement both interfaces from `@eventualize/types/adapters/`:

| Method | Contract |
|--------|----------|
| `getEventsAsync(cursor, pageSize?)` | Async generator. Yield events with `offset >= cursor.offset`, in ascending order, each exactly once, reading `pageSize` (default 100) rows per query. |
| `getLastOffsetAsync(address)` | Last stored offset of the stream, or `-1` when empty. |
| `storeStreamAsync(events, messages)` | Store all of them atomically. If an event offset already exists, throw `Error("OPTIMISTIC_CONCURRENCY_VIOLATION")`. |
| `getSnapshotAsync(viewAddress, maxOffset?)` | Latest snapshot with `offset <= maxOffset` (or the latest one). Return the empty snapshot (offset `-1`) when there is none. |
| `storeSnapshotAsync(data)` | Store one view snapshot. |
| `close()` | Release connections. |

To produce the adapter spans, get the tracer through
`evDbTracerFor(spanName, tracer)` from `@eventualize/types/telemetry/EvDbSpanPolicy`.
It returns a no-op tracer when the stream factory's span policy turns that span
off:

```typescript
const tracer = evDbTracerFor("eventualize.adapter.store", trace.getTracer("my-adapter"));
return tracer.startActiveSpan("eventualize.adapter.store", async (span) => { /* ... */ });
```

Use the existing adapters as reference:
[`EvDbPrismaStorageAdapter.ts`](../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts)
and
[`EvDbDynamoDbStorageAdapter.ts`](../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts).
Run the shared integration tests in [`apps/sample-app/src/tests`](../../apps/sample-app/src/tests)
against it.
