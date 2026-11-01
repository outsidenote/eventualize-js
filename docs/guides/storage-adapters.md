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

Tables: `events`, `outbox` and `snapshot_v2`. The old `snapshot` table is
still created, for older SDK versions (see
[Snapshot rows and `snapshot_v2`](#snapshot-rows-and-snapshot_v2)). Apply the SQL migrations in
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

Same tables as PostgreSQL. Apply the SQL migrations in
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
| `snapshot_v2` | `view_address` (S) | `offset` (N) | Snapshot rows. Attributes `state` and `state_offset` |
| `snapshots` | `view_address` (S) | `offset` (N) | Old snapshot table, for older SDK versions only |
| `messages` | `message_address` (S) | `captured_at` (S) | |

Ready-made `CreateTable` inputs are in
[`packages/adapters/dynamodb-storage-adapter/models`](../../packages/adapters/dynamodb-storage-adapter/models):

```bash
for t in events snapshot_v2 snapshots messages; do
  aws dynamodb create-table --cli-input-json "file://models/$t-table-schema.json"
done
```

A store is one DynamoDB transaction, so one `store()` call can write at most 100
items (events + messages).

## Snapshot rows and `snapshot_v2`

Snapshots go to the table `snapshot_v2`. Each `store()` writes at most one row
per view, of one of two kinds (see [Snapshots](snapshots.md#what-store-writes)):

| Column | Full row | Pointer row | Default-state pointer |
| --- | --- | --- | --- |
| `offset` | offset of this row | offset of this row | offset of this row |
| `state` | the view state (JSON) | `NULL` | `NULL` |
| `state_offset` | equal to `offset` | offset of a full row | `NULL` |
| `stored_at` | write time | write time | write time |

- The key is the same as before: `(stream_type, stream_id, view_name, offset)`
  on SQL, `(view_address, offset)` on DynamoDB.
- `state_offset` always names a full row, never another pointer. Chains are
  one step deep.
- A default-state pointer means "the view still has its default state". The
  view has never applied an event with a handler.
- Rows are append-only. Nothing prunes old rows.

On load, the adapter reads the latest row with `offset <= maxOffset`. If it is
a pointer, it reads the full row it names: a second query on SQL, a `GetItem`
with `ConsistentRead: true` on DynamoDB. If that full row is missing, the load
throws. Do not delete a full row that a newer pointer names.

### Moving from the old `snapshot` table

Older SDK versions read and write `snapshot` (SQL) or `snapshots` (DynamoDB).
This version reads and writes only `snapshot_v2`. Both can run side by side.
Snapshots are a cache: an empty `snapshot_v2` only makes the first loads
replay more events. It never gives a wrong state.

Roll out in this order:

1. Create `snapshot_v2`: apply the `add_snapshot_v2` migration (SQL), or
   create the table from `models/snapshot_v2-table-schema.json` (DynamoDB).
2. Deploy the new SDK version.
3. Run the copy script below, so loads are fast right away.
4. Retire every service that still runs an older SDK version.
5. Only then drop the old table.

Rollback is safe: an older SDK reads the old table, gets an older snapshot,
and replays more events.

The copy scripts copy only the **latest** snapshot of each view, as a full
row. They never overwrite a row that already exists in `snapshot_v2`, so you
can run them again. They do not change the old table, and they are safe to run
while the app runs.

PostgreSQL (the script ships in the npm package):

```bash
psql "$POSTGRES_CONNECTION" \
  -f node_modules/@eventualize/postgres-storage-adapter/scripts/copy-snapshot-to-snapshot-v2.sql
```

MySQL 8 or MariaDB 10.2 and later (the script uses `ROW_NUMBER()`):

```bash
mysql -h host -u user -p db \
  < node_modules/@eventualize/mysql-storage-adapter/scripts/copy-snapshot-to-snapshot-v2.sql
```

DynamoDB:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { copySnapshotsToV2 } from "@eventualize/dynamodb-storage-adapter/copySnapshotsToV2";

const { views, copied } = await copySnapshotsToV2(new DynamoDBClient({ region: "eu-west-1" }));
```

`copySnapshotsToV2` scans `snapshots`, then reads and copies the latest row
of each view. The scan is eventually consistent, so a snapshot written while
it runs can be missed. If the app was running, run it again after the
rollout. `views` counts the views the scan found, and `copied` counts the
rows written. A view already in `snapshot_v2`, or whose row is gone before
the copy, counts in `views` but not in `copied`.

## Test helpers: admin classes

`EvDbPrismaStorageAdmin` (relational) and `EvDbDynamoDbAdmin` (DynamoDB) can
delete all rows with `clearEnvironmentAsync()`. Use them in tests only. They do
not create tables.

## Writing a new adapter

Implement both interfaces from `@eventualize/types/adapters/`. The snapshot
types are in `@eventualize/types/snapshots/` (`EvDbSnapshotBody`,
`EvDbStateRef`, `EvDbStoredSnapshotData`, `EvDbStoredSnapshotResultRaw`):

| Method | Contract |
|--------|----------|
| `getEventsAsync(cursor, pageSize?)` | Async generator. Yield events with `offset >= cursor.offset`, in ascending order, each exactly once, reading `pageSize` (default 100) rows per query. |
| `getLastOffsetAsync(address)` | Last stored offset of the stream, or `-1` when empty. |
| `storeStreamAsync(events, messages)` | Store all of them atomically. If an event offset already exists, throw `Error("OPTIMISTIC_CONCURRENCY_VIOLATION")`. |
| `getSnapshotAsync(viewAddress, maxOffset?)` | Latest row, full or pointer, with `offset <= maxOffset` (or the latest one). Return the empty snapshot (`EvDbStoredSnapshotResultRaw.Empty`, offset `-1`) when there is none. For a pointer, return the pointer's `offset` and `storedAt` with the state of the full row it names. Set `stateRef` to `{ kind: "row", offset }` (the full row's offset) or `{ kind: "default" }` with no state. Read the full row consistently: never a state from another offset. |
| `storeSnapshotAsync(data)` | Store one row. `data.body` is `{ kind: "full", state }` or `{ kind: "pointer", stateRef }`. A pointer stores no state. |
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
