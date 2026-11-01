# @eventualize/postgres-storage-adapter

PostgreSQL support for
[eventualize-js](https://github.com/outsidenote/eventualize-js). It creates
the Prisma client that
[`@eventualize/relational-storage-adapter`](https://www.npmjs.com/package/@eventualize/relational-storage-adapter)
uses.

## Install

```bash
pnpm add @eventualize/postgres-storage-adapter @eventualize/relational-storage-adapter
```

## Usage

```ts
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

const client = EvDbPostgresPrismaClientFactory.create("postgres://user:pass@host:5432/db");
const storage = new EvDbPrismaStorageAdapter(client, { kind: "postgres" });
```

`create()` without an argument reads the `POSTGRES_CONNECTION` env var.

## Tables

The database needs the tables `events`, `outbox` and `snapshot_v2`. Apply the SQL
files in
[`prisma/migrations`](https://github.com/outsidenote/eventualize-js/tree/main/packages/adapters/postgres-storage-adapter/prisma/migrations)
in name order. They are not part of the npm package. They also create `snapshot`, the
snapshot table of older SDK versions.

## Upgrading from the `snapshot` table

This version writes snapshots to `snapshot_v2`. Roll out in this order:

1. Apply the `add_snapshot_v2` migration.
2. Deploy the new version.
3. Copy the latest snapshot of each view. The script ships in the npm package:

   ```bash
   psql "$POSTGRES_CONNECTION" \
     -f node_modules/@eventualize/postgres-storage-adapter/scripts/copy-snapshot-to-snapshot-v2.sql
   ```

   It copies only the latest snapshot per view, never overwrites a row in `snapshot_v2`,
   and is safe to run again and while the app runs.
4. Retire every service on an older SDK version.
5. Only then drop the `snapshot` table.

See [Snapshot rows and `snapshot_v2`](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#snapshot-rows-and-snapshot_v2).

## Docs

[Storage adapters guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md)

## License

MIT
