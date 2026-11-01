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

The database needs the tables `events`, `outbox` and `snapshot`. Apply the SQL
files in
[`prisma/migrations`](https://github.com/outsidenote/eventualize-js/tree/main/packages/adapters/mysql-storage-adapter/prisma/migrations)
in name order. They are not part of the npm package.

## Docs

[Storage adapters guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md)

## License

MIT
