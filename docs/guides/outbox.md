# Deliver outbox messages: pg-boss and Debezium

`store()` writes outbox messages to the `outbox` table in the same transaction as
their events. Nothing in eventualize-js sends them anywhere. This guide shows
two ways to deliver them:

| | [pg-boss](#option-a-pg-boss-job-queue-in-postgresql) | [Debezium](#option-b-debezium-cdc-to-kafka) |
|--|--|--|
| Delivers to | A job queue in the same PostgreSQL | Kafka topics |
| Extra infrastructure | None | Kafka + Kafka Connect |
| How | A trigger copies each new outbox row into a pg-boss job, in the `store()` transaction | Debezium reads the database's write-ahead log (WAL) and publishes each new row |
| Order | Per stream (`key_strict_fifo` queue) | Per stream (Kafka key = stream id) |
| Good for | Background work in your own services | Many consumers, other teams, other languages |

Both are PostgreSQL only. Both were tested with the code on this page:
PostgreSQL 18, pg-boss 12.38, Debezium Connect 3.1, Kafka 7.8 (Confluent),
kafkajs 2.2.

The pg-boss example uses an account stream whose messages `DepositRequest` and
`Block` go to the channel `funds`. The Debezium example uses the
`PointsAddedNotification` message from
[Getting started](../getting-started.md#8-emit-outbox-messages).

## The outbox row

| Column | Content |
|--------|---------|
| `id` | Message id (UUID) |
| `stream_type`, `stream_id`, `offset` | The event that produced the message |
| `event_type` | That event's type |
| `channel` | Routing field you set in `EvDbMessage.createFromMetadata` (default `"default"`) |
| `message_type` | The message type, e.g. `"PointsAddedNotification"` |
| `payload` | The message payload (JSON) |
| `traceparent`, `tracestate` | W3C trace context of the code that appended the event |
| `serialize_type` | Payload format, `"json"` |
| `captured_by`, `captured_at`, `stored_at` | Who appended the event, and when; when it was stored |

## Recommended: one queue per channel

Set up one queue (or Kafka topic) per **channel**, not per message type.

- Give each message a channel that names one consumer's concern, for example
  `funds`. Set it in `EvDbMessage.createFromMetadata(metadata, type, payload, channel)`.
- Route each channel to its own queue: `outbox.funds`.
- In the consumer, fork on `message_type` (a discriminated union in TypeScript).

Why:

- **Order across message types.** Messages that must be handled in order, such
  as _deposit-request, block, deposit-request_, are often of different types.
  Order holds only inside one queue, so they must share one.
- **Fewer queues.** A new message type on an existing channel needs no new
  queue, trigger or connector change.
- **One owner per queue.** A channel maps to one consumer, so retries, dead
  letters and alerts stay in one place.

Use one queue per message type only when the types are fully independent and
need different queue settings.

---

## Option A: pg-boss (job queue in PostgreSQL)

[pg-boss](https://github.com/timgit/pg-boss) is a job queue that stores jobs in
PostgreSQL. A trigger on `outbox` adds one pg-boss job per new message. The
trigger runs inside the `store()` transaction, so a job exists if and only if
its event was stored.

The setup below follows the
[recommendation](#recommended-one-queue-per-channel): **one queue per channel**. All message types of a channel
share the queue, and the worker forks on `messageType`. Jobs of one stream are
handled **in order**, one at a time; different streams run in parallel.

### 1. Install

```bash
pnpm add pg-boss pg
```

### 2. Send messages to a channel

Set the channel as the fourth argument of `createFromMetadata`:

```ts
.withMessages("DepositRequested", (payload, _views, metadata) => [
  EvDbMessage.createFromMetadata(metadata, "DepositRequest", { amount: payload.amount }, "funds"),
])
.withMessages("AccountBlocked", (payload, _views, metadata) => [
  EvDbMessage.createFromMetadata(metadata, "Block", { reason: payload.reason }, "funds"),
])
```

### 3. Install the trigger and start a worker

```ts
// src/outbox/pgboss.ts
import { PgBoss } from "pg-boss";
import pg from "pg";

const CONNECTION = "postgres://evdb:evdbpassword@localhost:5432/evdb";

// One pg-boss job per new outbox row, in the queue "outbox.<channel>", inside
// the store() transaction. Rows whose channel has no queue are skipped.
const TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION evdb_outbox_to_pgboss() RETURNS trigger AS $$
DECLARE
  q pgboss.queue%ROWTYPE;
BEGIN
  SELECT * INTO q FROM pgboss.queue WHERE name = 'outbox.' || NEW.channel;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO pgboss.job (
    id, name, data, singleton_key, created_on, policy,
    retry_limit, retry_delay, retry_backoff, retry_delay_max,
    expire_seconds, deletion_seconds, keep_until, dead_letter, heartbeat_seconds
  ) VALUES (
    uuidv7(),          -- increases within a session: breaks created_on ties in order
    q.name,
    jsonb_build_object(
      'outboxId',    NEW.id,
      'streamType',  NEW.stream_type,
      'streamId',    NEW.stream_id,
      'offset',      NEW."offset",
      'channel',     NEW.channel,
      'messageType', NEW.message_type,
      'traceparent', NEW.traceparent,
      'tracestate',  NEW.tracestate,
      'payload',     NEW.payload::jsonb
    ),
    NEW.stream_id,     -- ordering key: FIFO per stream
    clock_timestamp(), -- now() is the same for every row of one store()
    q.policy,
    q.retry_limit, q.retry_delay, q.retry_backoff, q.retry_delay_max,
    q.expire_seconds, q.deletion_seconds,
    now() + q.retention_seconds * interval '1 second',
    q.dead_letter, q.heartbeat_seconds
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER evdb_outbox_to_pgboss
  AFTER INSERT ON outbox
  FOR EACH ROW EXECUTE FUNCTION evdb_outbox_to_pgboss();
`;

type OutboxJobBase = {
  outboxId: string;
  streamType: string;
  streamId: string;
  offset: number;
  channel: string;
  traceparent: string | null;
  tracestate: string | null;
};

// One queue, many message types: a discriminated union on messageType.
export type FundsJob =
  | (OutboxJobBase & { messageType: "DepositRequest"; payload: { amount: number } })
  | (OutboxJobBase & { messageType: "Block"; payload: { reason: string } });

const boss = new PgBoss(CONNECTION);
boss.on("error", console.error);
await boss.start(); // creates the pgboss schema on first run

await new pg.Pool({ connectionString: CONNECTION }).query(TRIGGER_SQL);

await boss.createQueue("outbox.funds", { policy: "key_strict_fifo", retryLimit: 3 });

await boss.work<FundsJob>("outbox.funds", { localConcurrency: 4 }, async ([job]) => {
  const msg = job.data;
  switch (msg.messageType) {
    case "DepositRequest":
      console.log(msg.streamId, "deposit", msg.payload.amount); // payload is typed per case
      break;
    case "Block":
      console.log(msg.streamId, "block", msg.payload.reason);
      break;
  }
});
```

### How the order is kept

A stream appends _deposit-request, block, deposit-request_. The worker must see
them in that order, also when a job fails and is retried.

| Part | Why it is needed |
|------|------------------|
| `policy: "key_strict_fifo"` | pg-boss gives each `singletonKey` one job at a time, oldest first. A job that is active, waiting to retry, or failed holds back the later jobs of its key. Other keys keep flowing. |
| `singleton_key = NEW.stream_id` | The key is the stream, so order is kept per stream (per account). Use another column or a payload field when the order must span streams. |
| `created_on = clock_timestamp()` | pg-boss picks the oldest job by `created_on`, then `id`. The default `now()` is the transaction start, so every message of one `store()` gets the same time. |
| `id = uuidv7()` | Breaks ties in `created_on`. The default id is a random UUID. |
| `policy`, `retry_*`, `expire_seconds`, ... from `pgboss.queue` | `boss.send()` copies the queue's settings into each job. A plain `INSERT` does not, so the trigger copies them itself. |

Tested with three streams of 10 messages each, written in one `store()` per
stream, with `localConcurrency: 4`, random handler delays and one failed job:
every stream was handled in order, and streams were interleaved. With the
default `now()` and random id, all three streams came out of order.

### Things to know

- **A failed job stops its stream.** With `key_strict_fifo`, a job that used
  all its retries stays `failed` and blocks the later jobs of the same stream.
  Other streams are not affected. Watch for failed jobs, then retry them
  (`boss.retry(...)`) or delete them to let the stream continue.
- **Order matters at startup.** `boss.start()` must run before the trigger is
  installed, because the trigger uses the `pgboss` schema.
- **Queues are opt-in.** The trigger adds a job only when the queue
  `outbox.<channel>` exists. Without this check, a missing queue would make the
  insert, and so `store()`, fail. Create the queue before the first message.
- **Queue-safe names.** pg-boss queue names may contain only letters, digits,
  `_`, `-`, `.` and `/`. Use channel names like `funds`.
- **One queue per message type instead** (not recommended, see
  [above](#recommended-one-queue-per-channel)). Replace `NEW.channel` with
  `NEW.message_type` in the trigger. Each queue then holds one payload type, and
  there is no order between message types.
- **PostgreSQL 18.** `uuidv7()` is built into PostgreSQL 18. This setup was not
  tested on earlier versions.
- **Internal tables.** The trigger writes to `pgboss.job` and reads
  `pgboss.queue`, which are pg-boss internals. It was tested with pg-boss 12.38.
  Pin the pg-boss major version, and test the trigger when you upgrade.
- **Tracing.** Each job carries `traceparent` and `tracestate`. Link to them
  from the worker: see [Tracing in the consumer](#tracing-in-the-consumer-span-links).

A full app that uses a simpler version of this pattern (one message type, no
ordering): [`apps/e2e/funds`](../../apps/e2e/funds) (`src/server.ts` and
`slices/AccountLeaderboard/pgboss`).

---

## Option B: Debezium CDC to Kafka

[Debezium](https://debezium.io/) reads PostgreSQL's write-ahead log and publishes
each new `outbox` row to Kafka. Its
[outbox event router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)
turns the row into a clean Kafka message. Debezium reads only committed data, so
a message is published only for a stored event.

Delivery is _at least once_: after a restart, Debezium can publish a message
again. Use the message `id` header to drop duplicates in the consumer.

### 1. Run PostgreSQL with logical replication

Debezium needs `wal_level=logical`. This Compose file starts PostgreSQL, Kafka
and Kafka Connect with the Debezium connectors:

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:18
    command: postgres -c wal_level=logical
    environment:
      POSTGRES_USER: evdb
      POSTGRES_PASSWORD: evdbpassword
      POSTGRES_DB: evdb
    ports: ["5432:5432"]

  kafka:
    image: confluentinc/cp-kafka:7.8.0
    hostname: kafka
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,INTERNAL://0.0.0.0:29092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092,INTERNAL://kafka:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: INTERNAL
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
    ports: ["9092:9092"]

  connect:
    image: quay.io/debezium/connect:3.1
    depends_on: [postgres, kafka]
    environment:
      BOOTSTRAP_SERVERS: kafka:29092
      GROUP_ID: evdb-connect
      CONFIG_STORAGE_TOPIC: connect_configs
      OFFSET_STORAGE_TOPIC: connect_offsets
      STATUS_STORAGE_TOPIC: connect_statuses
    ports: ["8083:8083"]
```

```bash
docker compose up -d
```

Then create the tables as in [Getting started, step 2](../getting-started.md#2-create-the-tables)
(use `docker compose exec -T postgres psql -U evdb -d evdb` in place of
`docker exec -i evdb-postgres psql -U evdb -d evdb`).

On a managed database (RDS, Cloud SQL, Azure), turn on logical replication in
the database settings, and give the Debezium user the replication role.

### 2. Register the connector

```json
{
  "name": "evdb-outbox",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "plugin.name": "pgoutput",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "evdb",
    "database.password": "evdbpassword",
    "database.dbname": "evdb",
    "topic.prefix": "evdb",
    "table.include.list": "public.outbox",
    "publication.autocreate.mode": "filtered",
    "snapshot.mode": "no_data",
    "tombstones.on.delete": "false",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.id": "id",
    "transforms.outbox.table.field.event.key": "stream_id",
    "transforms.outbox.table.field.event.payload": "payload",
    "transforms.outbox.table.expand.json.payload": "true",
    "transforms.outbox.route.by.field": "message_type",
    "transforms.outbox.route.topic.replacement": "outbox.${routedByValue}",
    "transforms.outbox.table.fields.additional.placement": "stream_type:header,offset:header,channel:header,traceparent:header,tracestate:header",
    "key.converter": "org.apache.kafka.connect.storage.StringConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false"
  }
}
```

```bash
curl -X POST -H "Content-Type: application/json" \
  --data @debezium-outbox.json http://localhost:8083/connectors
curl http://localhost:8083/connectors/evdb-outbox/status   # state: RUNNING
```

What the settings do:

| Setting | Effect |
|---------|--------|
| `table.include.list`, `publication.autocreate.mode: filtered` | Read only the `outbox` table. |
| `snapshot.mode: no_data` | Publish only rows inserted from now on. Use `initial` to also publish the rows that exist today. |
| `route.by.field`, `route.topic.replacement` | One topic per message type: `outbox.PointsAddedNotification`. For production, prefer [one topic per channel](#one-topic-per-channel-in-order) (see the [recommendation](#recommended-one-queue-per-channel)). |
| `table.field.event.key: stream_id` | The Kafka key is the stream id, so messages of one stream stay in order (one partition). |
| `table.expand.json.payload` + `value.converter.schemas.enable: false` | The Kafka value is your payload as plain JSON: `{"added":9,"total":9}`. |
| `table.fields.additional.placement` | Adds Kafka headers: `stream_type`, `offset`, `channel`, `traceparent`, `tracestate`. The router also adds an `id` header (the message id). |
| `key.converter: StringConverter` | The key is the plain stream id, not a JSON envelope. |

### One topic per channel, in order

This is the [recommended](#recommended-one-queue-per-channel) setup. To get all message types of a channel in one topic, route by `channel` and put
the message type in a header:

```json
"transforms.outbox.route.by.field": "channel",
"transforms.outbox.table.fields.additional.placement": "message_type:header,stream_type:header,offset:header,traceparent:header,tracestate:header",
```

The topic is then `outbox.funds`. The Kafka key is still the stream id, so all
messages of one stream go to one partition, in order. Tested: a stream that
appended _deposit-request, block, deposit-request_ in one `store()` arrived on
one partition of a 3-partition topic as `DepositRequest`, `Block`,
`DepositRequest`.

In the consumer, fork on the header:

```ts
switch (message.headers?.message_type?.toString()) {
  case "DepositRequest": /* ... */ break;
  case "Block": /* ... */ break;
}
```

Kafka keeps the order per partition. Your consumer keeps it only if it handles
one partition's messages one at a time (the kafkajs `eachMessage` default).

### 3. Consume

```ts
// src/outbox/kafka-consumer.ts
import { Kafka } from "kafkajs";
import { withLinkedSpan } from "./linked-span.js";

type PointsAddedNotification = { added: number; total: number };

const kafka = new Kafka({ clientId: "points-ledger", brokers: ["localhost:9092"] });
const TOPIC = "outbox.PointsAddedNotification";

// Debezium creates the topic on the first message. Create it up front so
// subscribe() does not fail on a fresh cluster.
const admin = kafka.admin();
await admin.connect();
if (!(await admin.listTopics()).includes(TOPIC)) {
  await admin.createTopics({ topics: [{ topic: TOPIC }] });
}
await admin.disconnect();

const consumer = kafka.consumer({ groupId: "points-notifications" });

await consumer.connect();
await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
await consumer.run({
  eachMessage: async ({ message }) => {
    const headers = Object.fromEntries(
      Object.entries(message.headers ?? {}).map(([k, v]) => [k, v?.toString()]),
    );
    const payload = JSON.parse(message.value!.toString()) as PointsAddedNotification;

    await withLinkedSpan(
      "process PointsAddedNotification",
      headers, // carries traceparent and tracestate
      { "messaging.system": "kafka", "messaging.destination.name": TOPIC, "messaging.message.id": headers.id },
      async () => {
        console.log(message.key?.toString(), payload);
      },
    );
  },
});
```

```bash
pnpm add kafkajs
```

`withLinkedSpan` is defined in
[Tracing in the consumer](#tracing-in-the-consumer-span-links) below.

A full app that uses this pattern:
[`apps/e2e/funds`](../../apps/e2e/funds) (`infrastructure/debezium-connector.json`
and `slices/RiskAssessment/kafka`).

---

## Tracing in the consumer: span links

Each outbox message carries the W3C `traceparent` and `tracestate` of the code
that appended its event. In the consumer, start a span that **links** to that
producer span, instead of making it the parent.

Why a link and not a parent:

- The consumer runs later, maybe minutes later, and maybe many times (retries).
  As a child, that work would stretch the producer's trace and mix its timing.
- One store can feed many consumers. Each consumer keeps its own trace.
- Backends show the link, so you can still jump from the consumer trace to the
  request that caused it.

### The helper

```ts
// src/outbox/linked-span.ts
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  propagation,
  trace,
  type Attributes,
  type Link,
  type Span,
} from "@opentelemetry/api";

const tracer = trace.getTracer("points-ledger");

export type TraceCarrier = {
  traceparent?: string | null;
  tracestate?: string | null;
};

/**
 * Runs `handle` in a span that links to the span which stored the outbox
 * message. The span's parent is the active span (for example the `process`
 * span pg-boss creates), or none, so the consumer keeps its own trace. The link
 * points back to the producer's trace.
 */
export async function withLinkedSpan<T>(
  name: string,
  carrier: TraceCarrier,
  attributes: Attributes,
  handle: (span: Span) => Promise<T>,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (carrier.traceparent) headers.traceparent = carrier.traceparent;
  if (carrier.tracestate) headers.tracestate = carrier.tracestate;

  // Read the producer's span context from the W3C fields. Extract into
  // ROOT_CONTEXT so nothing from the current context leaks in.
  const producer = trace.getSpanContext(propagation.extract(ROOT_CONTEXT, headers));
  const links: Link[] = producer ? [{ context: producer }] : [];

  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.CONSUMER, links, attributes },
    async (span) => {
      try {
        return await handle(span);
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
```

### With pg-boss

The job data holds `traceparent` and `tracestate`, so pass the job data as the
carrier:

```ts
await boss.work<FundsJob>("outbox.funds", { localConcurrency: 4 }, async ([job]) => {
  const msg = job.data;
  await withLinkedSpan(
    `process ${msg.messageType}`,
    msg,
    { "messaging.system": "pg-boss", "messaging.destination.name": "outbox.funds", "messaging.message.id": msg.outboxId },
    async () => {
      switch (msg.messageType) {
        case "DepositRequest": /* ... */ break;
        case "Block": /* ... */ break;
      }
    },
  );
});
```

pg-boss 12 has its own OpenTelemetry spans. It runs each handler inside a
`process outbox.funds` span, and your span becomes its child. The trigger leaves
the job's `trace_context` column empty on purpose: if it were filled, pg-boss
would make its `process` span a **child** of the producer span.

### With Kafka

The Debezium connector above copies `traceparent` and `tracestate` into Kafka
headers. Pass the headers as the carrier, as in the
[consumer example](#3-consume). Without a Kafka instrumentation library there
is no active span, so your span starts a new trace.

### What you get

Tested with an in-memory exporter, for one `store()` inside a request span:

| Consumer | Span | Parent | Trace | Link |
|----------|------|--------|-------|------|
| pg-boss | `process DepositRequest` | pg-boss `process outbox.funds` | new | the request span |
| Kafka | `process DepositRequest` | none | new | the request span |

The link exists only when the app that calls `store()` has an OTel SDK
registered, because otherwise the stored `traceparent` is empty. Without a
`traceparent`, `withLinkedSpan` creates the span with no link. To make the
consumer a child of the producer instead, see
[OpenTelemetry → Kafka consumer](opentelemetry.md#kafka-consumer--continue-the-upstream-trace).

---

## Cleaning up the outbox

eventualize-js never deletes outbox rows. Both options read a row once, when it
is inserted, so old rows are safe to delete. Run a periodic job, for example:

```sql
DELETE FROM outbox WHERE stored_at < now() - interval '7 days';
```

Keep rows long enough to debug and to replay a consumer by hand.
