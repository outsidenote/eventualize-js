# @eventualize/relational-storage-adapter

Prisma-based storage adapter for
[eventualize-js](https://github.com/outsidenote/eventualize-js) on SQL
databases. It stores events, outbox messages and view snapshots.

Use it together with a database package that creates the Prisma client:

- [`@eventualize/postgres-storage-adapter`](https://www.npmjs.com/package/@eventualize/postgres-storage-adapter)
- [`@eventualize/mysql-storage-adapter`](https://www.npmjs.com/package/@eventualize/mysql-storage-adapter)

## Install

```bash
pnpm add @eventualize/relational-storage-adapter @eventualize/postgres-storage-adapter
```

## Usage

```ts
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

const storage = new EvDbPrismaStorageAdapter(EvDbPostgresPrismaClientFactory.create(), {
  kind: "postgres",
});
const stream = await MyStreamFactory.get("id-1", storage, storage);
```

The optional `kind` option (`"postgres"`, `"mysql"` or `"relational"`) sets the
`eventualize.adapter.kind` attribute on the adapter's OpenTelemetry spans.
Default: `"relational"`.

## Snapshots

Snapshots are stored in the table `snapshot_v2`, as full rows or pointer rows. The old
`snapshot` table is no longer read or written. Before you upgrade, create `snapshot_v2`
with the `add_snapshot_v2` migration of your database package. Then copy the latest
snapshots with that package's `scripts/copy-snapshot-to-snapshot-v2.sql`. See
[Snapshot rows and `snapshot_v2`](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#snapshot-rows-and-snapshot_v2)
for the rollout order.

## Prisma version

Prisma is a regular dependency, pinned to the exact version that generated the
client in this package. Your app may use another Prisma version. Always create
the client with the database package's factory. A `PrismaClient` from your own
Prisma install is a different type.

## Docs

[Storage adapters guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md):
connection, tables, migrations.

## License

MIT
