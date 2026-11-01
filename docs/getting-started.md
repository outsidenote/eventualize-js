# Getting started

In this tutorial you build a small points ledger on PostgreSQL. You declare
events and views, store events, read state back, and emit outbox messages.

It takes about 15 minutes. You need Node.js 24, pnpm, and Docker.

## 1. Start PostgreSQL

```bash
docker run -d --name evdb-postgres -p 5432:5432 \
  -e POSTGRES_USER=evdb -e POSTGRES_PASSWORD=evdbpassword -e POSTGRES_DB=evdb \
  postgres:18
```

## 2. Create the tables

eventualize-js stores data in three tables: `events`, `outbox` and
`snapshot_v2`. The migrations also create `snapshot`, the table that older SDK
versions use. Run the PostgreSQL migrations from this repo, in order:

```bash
BASE=https://raw.githubusercontent.com/outsidenote/eventualize-js/main/packages/adapters/postgres-storage-adapter/prisma/migrations
for m in 20251211113311_change_outbox_payload_to_json 20261011150000_replace_telemetry_context_with_traceparent 20261101000000_add_snapshot_v2; do
  curl -s "$BASE/$m/migration.sql" | docker exec -i evdb-postgres psql -U evdb -d evdb
done
```

For MySQL and DynamoDB, see [Storage adapters](guides/storage-adapters.md).

## 3. Create the project

```bash
mkdir points-ledger && cd points-ledger
pnpm init
pnpm pkg set type=module
pnpm add @eventualize/core @eventualize/types @opentelemetry/api \
  @eventualize/postgres-storage-adapter @eventualize/relational-storage-adapter
pnpm add -D typescript tsx @types/node
```

pnpm may print `Run "pnpm approve-builds"`. You can ignore it: nothing in this
tutorial needs those build scripts.

The packages are ES modules. Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`tsx` runs the code, and `pnpm exec tsc` checks the types.

## 4. Declare the events

An event is a plain, read-only object type. Its name is the key you register it
under.

```ts
// src/points/events.ts
export type PointsAdded = { readonly points: number };
export type PointsSubtracted = { readonly points: number };
```

## 5. Declare the stream

A stream factory lists the stream's events, views and message producers. Build
it with `StreamFactoryBuilder`.

```ts
// src/points/PointsStreamFactory.ts
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { PointsAdded, PointsSubtracted } from "./events.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withEvent("PointsSubtracted")
  .asType<PointsSubtracted>()
  .withView("Sum", { sum: 0 }, {
    PointsAdded: (state, event) => ({ sum: state.sum + event.points }),
    PointsSubtracted: (state, event) => ({ sum: state.sum - event.points }),
  })
  .withView("Count", { count: 0 }, {
    PointsAdded: (state) => ({ count: state.count + 1 }),
    PointsSubtracted: (state) => ({ count: state.count + 1 }),
  })
  .build();

export default PointsStreamFactory;
export type PointsStreamType = typeof PointsStreamFactory.StreamType;
```

What this gives you:

- `"PointsStream"` is the stream type. It is stored with every event.
- Each `withEvent(...).asType<T>()` adds a typed method, here
  `appendEventPointsAdded(payload)` and `appendEventPointsSubtracted(payload)`.
- Each `withView(name, defaultState, handlers)` adds a view. A handler takes the
  old state and the event payload, and returns the **new** state. Do not change
  the old state.
- Call `withEvent` before `withView`, and `withView` before `withMessages`.
  Each step needs the types from the step before.

## 6. Write and read a stream

```ts
// src/main.ts
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import PointsStreamFactory from "./points/PointsStreamFactory.js";

const client = EvDbPostgresPrismaClientFactory.create(
  "postgres://evdb:evdbpassword@localhost:5432/evdb",
);
const storage = new EvDbPrismaStorageAdapter(client, { kind: "postgres" });

// Load the stream. A new stream id gives an empty stream.
const stream = await PointsStreamFactory.get("user-1", storage, storage);

await stream.appendEventPointsAdded({ points: 50 });
await stream.appendEventPointsSubtracted({ points: 20 });
await stream.store(); // events + outbox messages in one transaction, then snapshots

console.log(stream.views.Sum.sum, stream.views.Count.count); // 30 2

// Load it again: views come from the stored snapshot.
const again = await PointsStreamFactory.get("user-1", storage, storage);
console.log(again.views.Sum.sum, again.storedOffset); // 30 1

await storage.close();
```

```bash
pnpm exec tsx src/main.ts
```

The numbers in the comments are for the first run. Each run appends two more
events to `user-1`, so the next run prints `60 4` and `60 3`.

`get(streamId, streamAdapter, snapshotAdapter)` takes two adapters. The Prisma
and DynamoDB adapters do both jobs, so pass the same object twice.

## 7. Handle concurrent writers

Every stream has a stored offset. `store()` fails when another writer stored
first. Load the stream again and retry:

```ts
try {
  await stream.store();
} catch (err) {
  if (err instanceof Error && err.message === "OPTIMISTIC_CONCURRENCY_VIOLATION") {
    // reload with factory.get(...), check the business rule again, append, store
  } else {
    throw err;
  }
}
```

## 8. Emit outbox messages

A message producer runs for each new event of one type. It sees the payload and
the view states after the event. Messages are stored in the `outbox` table in the
same transaction as the event, so a consumer (for example a CDC pipeline) never
sees a message without its event.

Add this to the builder, after the `withView` calls:

```ts
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";

  .withMessages("PointsAdded", (payload, views, metadata) => [
    EvDbMessage.createFromMetadata(metadata, "PointsAddedNotification", {
      added: payload.points,
      total: views.Sum.sum,
    }),
  ])
```

`createFromMetadata` copies the stream cursor, time and trace context from the
event. Optional arguments set the `channel` and `shardName` (both `"default"`).

Run `src/main.ts` again, then look at the outbox:

```bash
docker exec evdb-postgres psql -U evdb -d evdb -c "select stream_id, message_type, payload from outbox"
```

To deliver these messages to workers or to Kafka, see
[Deliver outbox messages: pg-boss and Debezium](guides/outbox.md).

## 9. Keep factory files clean

Add [`@eventualize/eslint-plugin`](../packages/eslint-plugin) to check that each
factory file holds one factory and nothing else.

## Next steps

- [Concepts](concepts.md): how streams, views, snapshots and offsets fit together.
- [Outbox delivery](guides/outbox.md): send messages to pg-boss workers or to Kafka with Debezium.
- [Replay](guides/replay.md): look at a stream at a past offset.
- [Clone](guides/clone.md): copy a stream into a new one, with changes.
- [OpenTelemetry](guides/opentelemetry.md): see each append and store as a span.
- [`apps/sample-app`](../apps/sample-app): a bigger example with one file per
  event and view.
