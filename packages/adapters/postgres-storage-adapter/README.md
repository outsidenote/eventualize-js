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
const storage = new EvDbPrismaStorageAdapter(client);
```

`create()` without an argument reads the `POSTGRES_CONNECTION` env var.

## Tables

The database needs the tables `events`, `outbox` and `snapshot`. Apply the SQL
files in
[`prisma/migrations`](https://github.com/outsidenote/eventualize-js/tree/main/packages/adapters/postgres-storage-adapter/prisma/migrations)
in name order. They are not part of the npm package.

## Docs

[Storage adapters guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md)

## License

MIT
