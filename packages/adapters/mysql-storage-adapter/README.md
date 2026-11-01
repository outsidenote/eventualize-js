# @eventualize/mysql-storage-adapter

MySQL and MariaDB support for
[eventualize-js](https://github.com/outsidenote/eventualize-js). It creates
the Prisma client that
[`@eventualize/relational-storage-adapter`](https://www.npmjs.com/package/@eventualize/relational-storage-adapter)
uses.

## Install

```bash
pnpm add @eventualize/mysql-storage-adapter @eventualize/relational-storage-adapter
```

## Usage

```ts
import EvDbMySqlPrismaClientFactory from "@eventualize/mysql-storage-adapter/EvDbMySqlPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

const client = EvDbMySqlPrismaClientFactory.create("mariadb://user:pass@host:3306/db");
const storage = new EvDbPrismaStorageAdapter(
  client as unknown as ConstructorParameters<typeof EvDbPrismaStorageAdapter>[0],
  { kind: "mysql" },
);
```

- The client uses the MariaDB driver, so use a `mariadb://` URL.
- `create()` without an argument reads the `MYSQL_CONNECTION` env var.
- The cast is needed because this package has its own generated Prisma client
  type. It has the same shape at runtime.

## Tables

The database needs the tables `events`, `outbox` and `snapshot_v2`. Apply the SQL
files in
[`prisma/migrations`](https://github.com/outsidenote/eventualize-js/tree/main/packages/adapters/mysql-storage-adapter/prisma/migrations)
in name order. They are not part of the npm package. They also create `snapshot`, the
snapshot table of older SDK versions.

## Upgrading from the `snapshot` table

This version writes snapshots to `snapshot_v2`. Roll out in this order:

1. Apply the `add_snapshot_v2` migration.
2. Deploy the new version.
3. Copy the latest snapshot of each view. The script ships in the npm package:

   ```bash
   mysql -h host -u user -p db \
     < node_modules/@eventualize/mysql-storage-adapter/scripts/copy-snapshot-to-snapshot-v2.sql
   ```

   It copies only the latest snapshot per view, never overwrites a row in `snapshot_v2`,
   and is safe to run again and while the app runs. It needs MySQL 8 or MariaDB 10.2 and later.
4. Retire every service on an older SDK version.
5. Only then drop the `snapshot` table.

See [Snapshot rows and `snapshot_v2`](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#snapshot-rows-and-snapshot_v2).

## Docs

[Storage adapters guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md)

## License

MIT
