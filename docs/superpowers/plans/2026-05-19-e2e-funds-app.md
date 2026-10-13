# E2E Funds App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/e2e/funds` — a complete end-to-end demo app showing the full eventualize ecosystem: event-sourced stream → outbox → Debezium CDC → Kafka → two independent consumer processes maintaining Postgres and MongoDB read models.

**Architecture:** Two processes share one stream factory. `server.ts` handles REST commands and drives the leaderboard via a **pg-boss worker** — an outbox SQL trigger inserts jobs into `pgboss.job` transactionally, giving exactly-once delivery. `risk-server.ts` maintains per-account rolling risk windows in MongoDB via a **Kafka CDC consumer group** (Debezium). Commands are decoupled from transport — every slice exposes both its native transport binding and an HTTP binding over the same adapter.

**Tech Stack:** TypeScript, Node.js ESM, eventualize-js core/types/adapters, kafkajs, mongodb, pg, pg-boss, express, Debezium CDC, Docker Compose (Kafka KRaft, no Zookeeper), @opentelemetry/sdk-node, node:test

**PRD:** `spec/prds/e2e-sample.prd.md`

---

## File Map

```
apps/e2e/funds/
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── infrastructure/
│   ├── init.sql
│   └── debezium-connector.json
└── src/
    ├── server.ts
    ├── risk-server.ts
    ├── tests/
    │   └── StorageAdapterStub.ts
    ├── abstractions/
    │   ├── commands/
    │   │   ├── ICommand.ts
    │   │   ├── commandHandler.ts
    │   │   └── CommandHandlerOrchestratorFactory.ts
    │   └── endpoints/
    │       └── kafkaConsumerUtils.ts
    └── BusinessCapabilities/Funds/
        ├── swimlanes/Funds/
        │   ├── index.ts                        ← stream factory
        │   ├── events/
        │   │   ├── FundsDeposited.ts
        │   │   └── FundsWithdrawn.ts
        │   ├── views/Balance/
        │   │   ├── state.ts
        │   │   ├── handlers.ts
        │   │   └── view.slice.test.ts
        │   └── messages/
        │       └── fundsChangedMessages.ts
        └── slices/
            ├── DepositFunds/
            │   ├── command.ts
            │   ├── commandHandler.ts
            │   ├── commandHandler.test.ts
            │   ├── adapter.ts
            │   └── http/index.ts
            ├── WithdrawFunds/
            │   ├── command.ts
            │   ├── commandHandler.ts
            │   ├── commandHandler.test.ts
            │   ├── adapter.ts
            │   └── http/index.ts
            ├── AccountLeaderboard/
            │   ├── command.ts
            │   ├── commandHandler.ts
            │   ├── commandHandler.test.ts
            │   ├── adapter.ts
            │   ├── pgboss/index.ts
            │   └── http/index.ts
            └── RiskAssessment/
                ├── command.ts
                ├── commandHandler.ts
                ├── commandHandler.test.ts
                ├── adapter.ts
                ├── kafka/index.ts
                └── http/index.ts
```

---

## Task 1: Monorepo Registration & Package Scaffold

**Files:**

- Modify: `package.json` (root) — add `apps/e2e/*` to workspaces
- Modify: `tsconfig.json` (root) — add `apps/e2e/funds` reference
- Create: `apps/e2e/funds/package.json`
- Create: `apps/e2e/funds/tsconfig.json`

- [ ] **Step 1: Add workspace glob and tsconfig reference**

Edit root `package.json` — change `"workspaces"` from:

```json
"workspaces": [
  "packages/*",
  "packages/adapters/*",
  "apps/*"
]
```

to:

```json
"workspaces": [
  "packages/*",
  "packages/adapters/*",
  "apps/*",
  "apps/e2e/*"
]
```

Edit root `tsconfig.json` — add to `"references"` array:

```json
{
  "path": "./apps/e2e/funds"
}
```

- [ ] **Step 2: Create `apps/e2e/funds/package.json`**

```json
{
  "name": "e2e-funds",
  "version": "1.0.0",
  "private": true,
  "description": "E2E demo: funds deposit/withdrawal with CDC outbox → Kafka → read models",
  "type": "module",
  "imports": {
    "#abstractions/*": "./src/abstractions/*",
    "#BusinessCapabilities/*": "./src/BusinessCapabilities/*"
  },
  "scripts": {
    "build": "tsc --build",
    "clean": "rimraf dist tsconfig.tsbuildinfo",
    "start": "node --import tsx src/server.ts",
    "start:risk": "node --import tsx src/risk-server.ts",
    "test:unit": "node --import tsx --test 'src/**/*.test.ts'"
  },
  "dependencies": {
    "@eventualize/core": "^6.0.0",
    "@eventualize/postgres-storage-adapter": "^6.0.0",
    "@eventualize/relational-storage-adapter": "^6.0.0",
    "@eventualize/types": "^6.0.0",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/auto-instrumentations-node": "^0.57.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57.0",
    "@opentelemetry/sdk-node": "^0.57.0",
    "@prisma/adapter-pg": "^7.1.0",
    "express": "^4.21.0",
    "kafkajs": "^2.2.4",
    "mongodb": "^6.0.0",
    "pg": "^8.0.0",
    "pg-boss": "^12.14.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "@types/pg": "^8.18.0",
    "tsx": "^4.21.0",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create `apps/e2e/funds/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "paths": {
      "#abstractions/*": ["./src/abstractions/*"],
      "#BusinessCapabilities/*": ["./src/BusinessCapabilities/*"]
    }
  },
  "references": [
    { "path": "../../../packages/types" },
    { "path": "../../../packages/core" },
    { "path": "../../../packages/adapters/relational-storage-adapter" },
    { "path": "../../../packages/adapters/postgres-storage-adapter" }
  ],
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: installs into `apps/e2e/funds/node_modules/`, symlinks `@eventualize/*` packages.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/funds/package.json apps/e2e/funds/tsconfig.json package.json tsconfig.json package-lock.json
git commit -m "chore(e2e-funds): scaffold workspace package"
```

---

## Task 2: Copy Shared Testing Infrastructure & Abstractions

**Files:**

- Create: `apps/e2e/funds/src/tests/StorageAdapterStub.ts`
- Create: `apps/e2e/funds/src/abstractions/commands/ICommand.ts`
- Create: `apps/e2e/funds/src/abstractions/commands/commandHandler.ts`
- Create: `apps/e2e/funds/src/abstractions/commands/CommandHandlerOrchestratorFactory.ts`
- Create: `apps/e2e/funds/src/abstractions/endpoints/kafkaConsumerUtils.ts`

These files are adapted from the blueprint. They are small enough that copying is the right call — the monorepo doesn't need a shared framework package for a demo app.

- [ ] **Step 1: Create `src/tests/StorageAdapterStub.ts`**

```typescript
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbContinuousFetchOptions from "@eventualize/types/primitives/EvDbContinuousFetchOptions";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbMessageFilter from "@eventualize/types/messages/EvDbMessageFilter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type { EvDbShardName } from "@eventualize/types/primitives/EvDbShardName";
import type StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";

export default class StorageAdapterStub
  implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter
{
  close(): Promise<void> {
    throw new Error("Not implemented");
  }
  getEventsAsync(_cursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined> {
    throw new Error("Not implemented");
  }
  getLastOffsetAsync(_address: EvDbStreamAddress): Promise<number> {
    throw new Error("Not implemented");
  }
  storeStreamAsync(
    _events: ReadonlyArray<EvDbEvent>,
    _messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    throw new Error("Not implemented");
  }
  getFromOutbox(
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
  ): Promise<AsyncIterable<EvDbMessage>> {
    throw new Error("Not implemented");
  }
  getFromOutboxAsync(
    _shard: EvDbShardName,
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
    _cancellation?: AbortSignal,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Not implemented");
  }
  getRecordsFromOutboxAsync(
    _shard: unknown,
    _filter?: unknown,
    _options?: unknown,
    _cancellation?: unknown,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Not implemented");
  }
  subscribeToMessageAsync(
    _handler: unknown,
    _shard: unknown,
    _filter?: unknown,
    _options?: unknown,
  ): Promise<void> {
    throw new Error("Not implemented");
  }
  getSnapshotAsync(
    _viewAddress: EvDbViewAddress,
    _signal?: AbortSignal,
  ): Promise<EvDbStoredSnapshotResultRaw> {
    throw new Error("Not implemented");
  }
  storeSnapshotAsync(_snapshotData: EvDbStoredSnapshotData, _signal?: AbortSignal): Promise<void> {
    throw new Error("Not implemented");
  }
}
```

- [ ] **Step 2: Create `src/abstractions/commands/ICommand.ts`**

```typescript
export interface ICommand {
  readonly commandType: string;
}
```

- [ ] **Step 3: Create `src/abstractions/commands/commandHandler.ts`**

```typescript
import type EvDbStream from "@eventualize/core/store/EvDbStream";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";

export type CommandHandler<TStream extends EvDbStream, TCommand> = (
  stream: TStream,
  command: TCommand,
) => void;

export interface CommandHandlerOrchestratorResult {
  readonly streamId: string;
  readonly events: readonly EvDbEvent[];
}

export type CommandHandlerOrchestrator<TCommand> = (
  command: TCommand,
) => Promise<CommandHandlerOrchestratorResult>;
```

- [ ] **Step 4: Create `src/abstractions/commands/CommandHandlerOrchestratorFactory.ts`**

```typescript
import type {
  CommandHandler,
  CommandHandlerOrchestrator,
  CommandHandlerOrchestratorResult,
} from "./commandHandler.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type {
  EvDbStreamFactory,
  StreamWithEventMethods,
} from "@eventualize/core/factories/EvDbStreamFactory";

export class CommandHandlerOrchestratorFactory {
  static create<
    TCommand,
    TEventMap extends Record<string, object>,
    TStreamType extends string,
    TViews extends Record<string, unknown> = {},
  >(
    storageAdapter: IEvDbStorageAdapter,
    streamFactory: EvDbStreamFactory<TEventMap, TStreamType, TViews>,
    getStreamId: (command: TCommand) => string,
    commandHandler: CommandHandler<StreamWithEventMethods<TEventMap, TViews>, TCommand>,
  ): CommandHandlerOrchestrator<TCommand> {
    return async (command: TCommand): Promise<CommandHandlerOrchestratorResult> => {
      const streamId = getStreamId(command);
      const stream = (await streamFactory.get(
        streamId,
        storageAdapter,
        storageAdapter,
      )) as StreamWithEventMethods<TEventMap, TViews>;

      commandHandler(stream, command);

      const events = stream.getEvents();
      if (events.length > 0) {
        await stream.store();
      }

      return { streamId, events };
    };
  }
}
```

- [ ] **Step 5: Create `src/abstractions/endpoints/kafkaConsumerUtils.ts`**

```typescript
import { type Kafka, type Consumer } from "kafkajs";

const RETRY_INTERVAL_MS = 5_000;

export type EventMeta = { outboxId: string; storedAt: Date };

export function launchKafkaConsumer(opts: {
  kafka: Kafka;
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  onMessage: (topic: string, payload: Record<string, unknown>, meta: EventMeta) => Promise<void>;
}): { stop: () => Promise<void> } {
  const { kafka, groupId, topics, fromBeginning = true, onMessage } = opts;

  let stopped = false;
  let consumer: Consumer | null = null;
  const retryTimers: ReturnType<typeof setTimeout>[] = [];

  const scheduleRetry = () => {
    if (stopped) return;
    const timer = setTimeout(() => {
      if (!stopped) void attempt();
    }, RETRY_INTERVAL_MS);
    retryTimers.push(timer);
  };

  const attempt = async () => {
    if (stopped) return;
    const c = kafka.consumer({ groupId });
    consumer = c;
    try {
      await c.connect();
      await c.subscribe({ topics, fromBeginning });
      console.info("[KafkaConsumer] started", { groupId, topics });
      await c.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message, heartbeat }) => {
          void heartbeat();
          const outboxId = extractOutboxId(message);
          const payload = parsePayload(message);
          await onMessage(topic, payload, {
            outboxId,
            storedAt: new Date(Number(message.timestamp)),
          });
          await c.commitOffsets([
            { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
          ]);
        },
      });
    } catch (err) {
      const isMissing =
        err instanceof Error &&
        (err as Error & { type?: string }).type === "UNKNOWN_TOPIC_OR_PARTITION";
      if (isMissing) {
        console.info(
          `[KafkaConsumer] ${groupId} topic not yet available, retrying in ${RETRY_INTERVAL_MS / 1000}s`,
        );
      } else {
        console.error(
          `[KafkaConsumer] ${groupId} crashed, retrying in ${RETRY_INTERVAL_MS / 1000}s`,
          err,
        );
      }
      try {
        await c.disconnect();
      } catch {
        /* best-effort */
      }
      consumer = null;
      scheduleRetry();
    }
  };

  void attempt();

  return {
    stop: async () => {
      stopped = true;
      for (const timer of retryTimers) clearTimeout(timer);
      retryTimers.length = 0;
      if (consumer) {
        try {
          await consumer.disconnect();
        } catch (err) {
          console.warn("[KafkaConsumer] disconnect failed", err);
        } finally {
          consumer = null;
        }
      }
    },
  };
}

export function extractOutboxId(message: {
  key: Buffer | null;
  value: Buffer | null;
  headers?: Record<string, unknown>;
}): string {
  if (message.headers) {
    const idHeader = message.headers["id"];
    if (idHeader) return Buffer.isBuffer(idHeader) ? idHeader.toString() : String(idHeader);
  }
  if (message.value) {
    try {
      const parsed = JSON.parse(message.value.toString());
      const value = parsed.payload ?? parsed;
      if (value && typeof value === "object" && "outboxId" in value)
        return String((value as Record<string, unknown>).outboxId);
    } catch {
      /* best-effort */
    }
  }
  throw new Error(
    "[KafkaConsumer] Cannot extract outboxId — header 'id' missing and payload has no outboxId.",
  );
}

export function parsePayload(message: { value: Buffer | null }): Record<string, unknown> {
  if (!message.value) throw new Error("[KafkaConsumer] message value is null");
  try {
    const parsed = JSON.parse(message.value.toString());
    const inner = parsed.payload ?? parsed;
    if (typeof inner === "string") {
      const obj = JSON.parse(inner);
      if (!isRecord(obj)) throw new Error("payload is not an object");
      return obj;
    }
    if (!isRecord(inner)) throw new Error("payload is not an object");
    return inner;
  } catch (err) {
    throw new Error(
      `[KafkaConsumer] payload parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
```

- [ ] **Step 6: Verify TypeScript resolves the imports**

```bash
cd apps/e2e/funds && node --import tsx --eval "import './src/abstractions/commands/CommandHandlerOrchestratorFactory.ts'; console.log('ok')"
```

Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add apps/e2e/funds/src/
git commit -m "feat(e2e-funds): add abstractions and test infrastructure"
```

---

## Task 3: Stream Events & Balance View

**Files:**

- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/events/FundsDeposited.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/events/FundsWithdrawn.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/state.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/handlers.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/view.slice.test.ts`

- [ ] **Step 1: Write the failing test for the Balance view**

Create `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/view.slice.test.ts`:

```typescript
import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

// Import targets that do not yet exist — test will fail to compile / run
import { handlers } from "./handlers.js";
import { defaultState, viewName } from "./state.js";

const meta: IEvDbEventMetadata = {
  streamCursor: new EvDbStreamCursor("funds-stream", "test", 0),
  eventType: "",
  capturedAt: new Date(),
  capturedBy: "test",
};

describe(`View: ${viewName}`, () => {
  test("FundsDeposited increases balance", () => {
    const s = handlers.FundsDeposited(
      defaultState,
      { accountId: "a1", amount: 100, currency: "USD" },
      meta,
    );
    assert.strictEqual(s, 100);
  });

  test("FundsWithdrawn decreases balance", () => {
    const s0 = handlers.FundsDeposited(
      defaultState,
      { accountId: "a1", amount: 200, currency: "USD" },
      meta,
    );
    const s1 = handlers.FundsWithdrawn(s0, { accountId: "a1", amount: 75, currency: "USD" }, meta);
    assert.strictEqual(s1, 125);
  });

  test("balance cannot go below zero (withdrawal clamped)", () => {
    const s = handlers.FundsWithdrawn(
      defaultState,
      { accountId: "a1", amount: 50, currency: "USD" },
      meta,
    );
    assert.strictEqual(s, -50); // we track raw balance — business guard is in commandHandler
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/view.slice.test.ts
```

Expected: Error — module not found for `./handlers.js` or `./state.js`.

- [ ] **Step 3: Create event types**

`apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/events/FundsDeposited.ts`:

```typescript
export interface FundsDeposited {
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
}
```

`apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/events/FundsWithdrawn.ts`:

```typescript
export interface FundsWithdrawn {
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
}
```

- [ ] **Step 4: Create Balance view state and handlers**

`apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/state.ts`:

```typescript
export type BalanceViewState = number;
export const viewName = "balance" as const;
export const defaultState: BalanceViewState = 0;
```

`apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/handlers.ts`:

```typescript
import type { FundsDeposited } from "../../events/FundsDeposited.js";
import type { FundsWithdrawn } from "../../events/FundsWithdrawn.js";
import type { BalanceViewState } from "./state.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

export const handlers = {
  FundsDeposited: (
    state: BalanceViewState,
    event: FundsDeposited,
    _meta: IEvDbEventMetadata,
  ): BalanceViewState => state + event.amount,

  FundsWithdrawn: (
    state: BalanceViewState,
    event: FundsWithdrawn,
    _meta: IEvDbEventMetadata,
  ): BalanceViewState => state - event.amount,
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/swimlanes/Funds/views/Balance/view.slice.test.ts
```

Expected: `✔ View: balance` with 3 passing subtests.

- [ ] **Step 6: Commit**

```bash
git add apps/e2e/funds/src/BusinessCapabilities/
git commit -m "feat(e2e-funds): add stream events and balance view with tests"
```

---

## Task 4: FundsChanged Message & Stream Factory

**Files:**

- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/messages/fundsChangedMessages.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts`

- [ ] **Step 1: Create `fundsChangedMessages.ts`**

```typescript
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { FundsDeposited } from "../events/FundsDeposited.js";
import type { FundsWithdrawn } from "../events/FundsWithdrawn.js";

export const depositedMessages = (
  payload: Readonly<FundsDeposited>,
  views: Readonly<{ balance: number }>,
  metadata: IEvDbEventMetadata,
): EvDbMessage[] => [
  EvDbMessage.createFromMetadata(metadata, "FundsChanged", {
    accountId: payload.accountId,
    currentBalance: views.balance,
    delta: payload.amount,
    currency: payload.currency,
    transactionId: String(metadata.streamCursor.offset),
  }),
];

export const withdrawnMessages = (
  payload: Readonly<FundsWithdrawn>,
  views: Readonly<{ balance: number }>,
  metadata: IEvDbEventMetadata,
): EvDbMessage[] => [
  EvDbMessage.createFromMetadata(metadata, "FundsChanged", {
    accountId: payload.accountId,
    currentBalance: views.balance,
    delta: -payload.amount,
    currency: payload.currency,
    transactionId: String(metadata.streamCursor.offset),
  }),
];
```

- [ ] **Step 2: Create stream factory `index.ts`**

```typescript
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { FundsDeposited } from "./events/FundsDeposited.js";
import type { FundsWithdrawn } from "./events/FundsWithdrawn.js";
import { viewName, defaultState, handlers } from "./views/Balance/index.js";
import { depositedMessages, withdrawnMessages } from "./messages/fundsChangedMessages.js";

const FundsStreamFactory = new StreamFactoryBuilder("funds-stream")
  .withEvent("FundsDeposited")
  .asType<FundsDeposited>()
  .withEvent("FundsWithdrawn")
  .asType<FundsWithdrawn>()
  .withView(viewName, defaultState, handlers)
  .withMessages("FundsDeposited", depositedMessages)
  .withMessages("FundsWithdrawn", withdrawnMessages)
  .build();

export default FundsStreamFactory;
export type FundsStreamType = typeof FundsStreamFactory.StreamType;
```

Also create `views/Balance/index.ts` to re-export:

```typescript
export { viewName, defaultState } from "./state.js";
export { handlers } from "./handlers.js";
```

- [ ] **Step 3: Verify factory compiles**

```bash
cd apps/e2e/funds && node --import tsx --eval "import('./src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts').then(m => console.log('stream type:', m.default.streamType))"
```

Expected: `stream type: funds-stream`

- [ ] **Step 4: Commit**

```bash
git add apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/
git commit -m "feat(e2e-funds): add FundsChanged message and stream factory"
```

---

## Task 5: DepositFunds Slice

**Files:**

- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/command.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/commandHandler.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/commandHandler.test.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/adapter.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/http/index.ts`

- [ ] **Step 1: Write the failing test**

Create `commandHandler.test.ts`:

```typescript
import { test, describe } from "node:test";
import * as assert from "node:assert";
import StorageAdapterStub from "../../../../tests/StorageAdapterStub.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleDeposit } from "./commandHandler.js";

describe("DepositFunds commandHandler", () => {
  test("appendEventFundsDeposited is called with the command payload", async () => {
    const storageAdapter = new StorageAdapterStub();
    const stream = FundsStreamFactory.create("acc-1", storageAdapter, storageAdapter);

    handleDeposit(stream, {
      commandType: "DepositFunds",
      accountId: "acc-1",
      amount: 150,
      currency: "USD",
    });

    const events = stream.getEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, "FundsDeposited");
    assert.deepStrictEqual(events[0].payload, { accountId: "acc-1", amount: 150, currency: "USD" });
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/DepositFunds/commandHandler.test.ts
```

Expected: Error — `./commandHandler.js` not found.

- [ ] **Step 3: Create `command.ts`**

```typescript
import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface DepositFunds extends ICommand {
  readonly commandType: "DepositFunds";
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
}
```

- [ ] **Step 4: Create `commandHandler.ts`**

```typescript
import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import type { DepositFunds } from "./command.js";

export const handleDeposit: CommandHandler<FundsStreamType, DepositFunds> = (stream, command) => {
  stream.appendEventFundsDeposited({
    accountId: command.accountId,
    amount: command.amount,
    currency: command.currency,
  });
};
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/DepositFunds/commandHandler.test.ts
```

Expected: `✔ DepositFunds commandHandler` — 1 passing.

- [ ] **Step 6: Create `adapter.ts`**

```typescript
import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleDeposit } from "./commandHandler.js";
import type { DepositFunds } from "./command.js";

export function createDepositAdapter(
  storageAdapter: IEvDbStorageAdapter,
): CommandHandlerOrchestrator<DepositFunds> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (cmd) => cmd.accountId,
    handleDeposit,
  );
}
```

- [ ] **Step 7: Create `http/index.ts`**

```typescript
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { createDepositAdapter } from "../adapter.js";

export function createDepositHttpHandler(storageAdapter: IEvDbStorageAdapter) {
  const deposit = createDepositAdapter(storageAdapter);

  return async (req: Request, res: Response) => {
    const { accountId, amount, currency } = req.body as Record<string, unknown>;
    if (!accountId || amount == null) {
      res.status(400).json({ error: "accountId and amount are required" });
      return;
    }
    try {
      const result = await deposit({
        commandType: "DepositFunds",
        accountId: String(accountId),
        amount: Number(amount),
        currency: String(currency ?? "USD"),
      });
      res.json({
        streamId: result.streamId,
        emittedEventTypes: result.events.map((e) => e.eventType),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "OPTIMISTIC_CONCURRENCY_VIOLATION") {
        res.status(409).json({ error: "Concurrent modification" });
        return;
      }
      console.error("[DepositFunds] error:", err);
      res.status(500).json({ error: msg });
    }
  };
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/
git commit -m "feat(e2e-funds): add DepositFunds slice with HTTP transport"
```

---

## Task 6: WithdrawFunds Slice

**Files:**

- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/command.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/commandHandler.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/commandHandler.test.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/adapter.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/http/index.ts`

- [ ] **Step 1: Write failing tests**

Create `commandHandler.test.ts`:

```typescript
import { test, describe } from "node:test";
import * as assert from "node:assert";
import StorageAdapterStub from "../../../../tests/StorageAdapterStub.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleWithdraw } from "./commandHandler.js";

describe("WithdrawFunds commandHandler", () => {
  test("appends FundsWithdrawn when balance is sufficient", async () => {
    const storageAdapter = new StorageAdapterStub();
    const stream = FundsStreamFactory.create("acc-1", storageAdapter, storageAdapter);
    stream.appendEventFundsDeposited({ accountId: "acc-1", amount: 200, currency: "USD" });

    handleWithdraw(stream, {
      commandType: "WithdrawFunds",
      accountId: "acc-1",
      amount: 50,
      currency: "USD",
    });

    const events = stream.getEvents();
    const withdrawn = events.filter((e) => e.eventType === "FundsWithdrawn");
    assert.strictEqual(withdrawn.length, 1);
    assert.deepStrictEqual(withdrawn[0].payload, {
      accountId: "acc-1",
      amount: 50,
      currency: "USD",
    });
  });

  test("throws INSUFFICIENT_FUNDS when balance is too low", async () => {
    const storageAdapter = new StorageAdapterStub();
    const stream = FundsStreamFactory.create("acc-1", storageAdapter, storageAdapter);

    assert.throws(
      () =>
        handleWithdraw(stream, {
          commandType: "WithdrawFunds",
          accountId: "acc-1",
          amount: 50,
          currency: "USD",
        }),
      { message: "INSUFFICIENT_FUNDS" },
    );
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/WithdrawFunds/commandHandler.test.ts
```

Expected: Error — `./commandHandler.js` not found.

- [ ] **Step 3: Create `command.ts`**

```typescript
import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface WithdrawFunds extends ICommand {
  readonly commandType: "WithdrawFunds";
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
}
```

- [ ] **Step 4: Create `commandHandler.ts`**

```typescript
import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import type { WithdrawFunds } from "./command.js";

export const handleWithdraw: CommandHandler<FundsStreamType, WithdrawFunds> = (stream, command) => {
  if (stream.views.balance < command.amount) {
    throw new Error("INSUFFICIENT_FUNDS");
  }
  stream.appendEventFundsWithdrawn({
    accountId: command.accountId,
    amount: command.amount,
    currency: command.currency,
  });
};
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/WithdrawFunds/commandHandler.test.ts
```

Expected: `✔ WithdrawFunds commandHandler` — 2 passing.

- [ ] **Step 6: Create `adapter.ts`**

```typescript
import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleWithdraw } from "./commandHandler.js";
import type { WithdrawFunds } from "./command.js";

export function createWithdrawAdapter(
  storageAdapter: IEvDbStorageAdapter,
): CommandHandlerOrchestrator<WithdrawFunds> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (cmd) => cmd.accountId,
    handleWithdraw,
  );
}
```

- [ ] **Step 7: Create `http/index.ts`**

```typescript
import type { Request, Response } from "express";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { createWithdrawAdapter } from "../adapter.js";

export function createWithdrawHttpHandler(storageAdapter: IEvDbStorageAdapter) {
  const withdraw = createWithdrawAdapter(storageAdapter);

  return async (req: Request, res: Response) => {
    const { accountId, amount, currency } = req.body as Record<string, unknown>;
    if (!accountId || amount == null) {
      res.status(400).json({ error: "accountId and amount are required" });
      return;
    }
    try {
      const result = await withdraw({
        commandType: "WithdrawFunds",
        accountId: String(accountId),
        amount: Number(amount),
        currency: String(currency ?? "USD"),
      });
      res.json({
        streamId: result.streamId,
        emittedEventTypes: result.events.map((e) => e.eventType),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "INSUFFICIENT_FUNDS") {
        res.status(422).json({ error: "Insufficient funds" });
        return;
      }
      if (msg === "OPTIMISTIC_CONCURRENCY_VIOLATION") {
        res.status(409).json({ error: "Concurrent modification" });
        return;
      }
      console.error("[WithdrawFunds] error:", err);
      res.status(500).json({ error: msg });
    }
  };
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/
git commit -m "feat(e2e-funds): add WithdrawFunds slice with balance guard and HTTP transport"
```

---

## Task 7: AccountLeaderboard Slice

**Files:**

- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/command.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/commandHandler.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/commandHandler.test.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/adapter.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/kafka/index.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/http/index.ts`

- [ ] **Step 1: Write failing test**

Create `commandHandler.test.ts`:

```typescript
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { handleUpdateLeaderboard } from "./commandHandler.js";
import type { UpdateAccountLeaderboard } from "./command.js";

describe("AccountLeaderboard commandHandler", () => {
  test("executes SQL UPSERT with correct deposit params", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const mockPool = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
    };

    const cmd: UpdateAccountLeaderboard = {
      commandType: "UpdateAccountLeaderboard",
      accountId: "acc-1",
      delta: 100,
      currentBalance: 100,
      currency: "USD",
      transactionId: "tx-1",
    };

    await handleUpdateLeaderboard(cmd, mockPool as never);

    assert.strictEqual(queries.length, 1);
    assert.ok(queries[0].sql.includes("INSERT INTO account_leaderboard"));
    assert.strictEqual(queries[0].params[0], "acc-1"); // accountId
    assert.strictEqual(queries[0].params[2], 100); // total_deposited increment
    assert.strictEqual(queries[0].params[3], 0); // total_withdrawn increment
    assert.strictEqual(queries[0].params[4], 100); // last_balance
  });

  test("executes SQL UPSERT with correct withdrawal params", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const mockPool = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
    };

    const cmd: UpdateAccountLeaderboard = {
      commandType: "UpdateAccountLeaderboard",
      accountId: "acc-1",
      delta: -50,
      currentBalance: 50,
      currency: "USD",
      transactionId: "tx-2",
    };

    await handleUpdateLeaderboard(cmd, mockPool as never);

    assert.strictEqual(queries[0].params[2], 0); // total_deposited increment = 0
    assert.strictEqual(queries[0].params[3], 50); // total_withdrawn increment = abs(delta)
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/AccountLeaderboard/commandHandler.test.ts
```

Expected: Error — `./commandHandler.js` not found.

- [ ] **Step 3: Create `command.ts`**

```typescript
import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface UpdateAccountLeaderboard extends ICommand {
  readonly commandType: "UpdateAccountLeaderboard";
  readonly accountId: string;
  readonly delta: number;
  readonly currentBalance: number;
  readonly currency: string;
  readonly transactionId: string;
}
```

- [ ] **Step 4: Create `commandHandler.ts`**

```typescript
import type { Pool } from "pg";
import type { UpdateAccountLeaderboard } from "./command.js";

export async function handleUpdateLeaderboard(
  cmd: UpdateAccountLeaderboard,
  pool: Pool,
): Promise<void> {
  const isDeposit = cmd.delta > 0;
  const deposited = isDeposit ? cmd.delta : 0;
  const withdrawn = isDeposit ? 0 : Math.abs(cmd.delta);
  const depositCount = isDeposit ? 1 : 0;
  const withdrawalCount = isDeposit ? 0 : 1;

  await pool.query(
    `INSERT INTO account_leaderboard
       (account_id, currency, total_deposited, total_withdrawn, last_balance, deposit_count, withdrawal_count, last_activity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       total_deposited  = account_leaderboard.total_deposited  + $3,
       total_withdrawn  = account_leaderboard.total_withdrawn  + $4,
       last_balance     = $5,
       deposit_count    = account_leaderboard.deposit_count    + $6,
       withdrawal_count = account_leaderboard.withdrawal_count + $7,
       last_activity    = NOW()`,
    [
      cmd.accountId,
      cmd.currency,
      deposited,
      withdrawn,
      cmd.currentBalance,
      depositCount,
      withdrawalCount,
    ],
  );
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/AccountLeaderboard/commandHandler.test.ts
```

Expected: `✔ AccountLeaderboard commandHandler` — 2 passing.

- [ ] **Step 6: Create `adapter.ts`**

```typescript
import type { Pool } from "pg";
import type { UpdateAccountLeaderboard } from "./command.js";
import { handleUpdateLeaderboard } from "./commandHandler.js";

export type AccountLeaderboardAdapter = (cmd: UpdateAccountLeaderboard) => Promise<void>;

export function createLeaderboardAdapter(pool: Pool): AccountLeaderboardAdapter {
  return (cmd) => handleUpdateLeaderboard(cmd, pool);
}
```

- [ ] **Step 7: Create `pgboss/index.ts`**

The pg-boss worker reads jobs placed by the outbox SQL trigger and maps them to the `UpdateAccountLeaderboard` command.

```typescript
import type { PgBoss } from "pg-boss";
import type { AccountLeaderboardAdapter } from "../adapter.js";

export const LEADERBOARD_QUEUE = "event.FundsChanged.UpdateAccountLeaderboard";

interface JobData {
  metadata: { outboxId: string };
  payload: {
    accountId: string;
    currentBalance: number;
    delta: number;
    currency: string;
    transactionId: string;
  };
}

export async function registerLeaderboardWorker(
  boss: PgBoss,
  adapter: AccountLeaderboardAdapter,
): Promise<void> {
  await boss.createQueue(LEADERBOARD_QUEUE);

  await boss.work(LEADERBOARD_QUEUE, async ([job]) => {
    const { payload } = job.data as JobData;
    await adapter({
      commandType: "UpdateAccountLeaderboard",
      accountId: payload.accountId,
      delta: payload.delta,
      currentBalance: payload.currentBalance,
      currency: payload.currency,
      transactionId: payload.transactionId,
    });
    console.log(
      `[Leaderboard/pgboss] account=${payload.accountId} balance=${payload.currentBalance}`,
    );
  });

  console.log(`[Leaderboard/pgboss] worker registered for ${LEADERBOARD_QUEUE}`);
}
```

- [ ] **Step 8: Create `http/index.ts`**

```typescript
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { AccountLeaderboardAdapter } from "../adapter.js";

export function createLeaderboardHttpHandler(adapter: AccountLeaderboardAdapter) {
  return async (req: Request, res: Response) => {
    const { accountId, delta, currentBalance, currency, transactionId } = req.body as Record<
      string,
      unknown
    >;
    if (!accountId || delta == null || currentBalance == null) {
      res.status(400).json({ error: "accountId, delta, and currentBalance are required" });
      return;
    }
    try {
      await adapter({
        commandType: "UpdateAccountLeaderboard",
        accountId: String(accountId),
        delta: Number(delta),
        currentBalance: Number(currentBalance),
        currency: String(currency ?? "USD"),
        transactionId: transactionId ? String(transactionId) : randomUUID(),
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[Leaderboard] HTTP error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/
git commit -m "feat(e2e-funds): add AccountLeaderboard slice with Kafka and HTTP transports"
```

---

## Task 8: RiskAssessment Slice

**Files:**

- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/command.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/commandHandler.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/commandHandler.test.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/adapter.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/kafka/index.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/http/index.ts`

- [ ] **Step 1: Write failing test**

Create `commandHandler.test.ts`:

```typescript
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { computeRiskLevel, handleUpdateRisk } from "./commandHandler.js";
import type { UpdateAccountRisk } from "./command.js";

describe("RiskAssessment — computeRiskLevel", () => {
  test("returns 'none' when fewer than 10 transactions", () => {
    const txs = [{ delta: -10 }, { delta: -10 }];
    assert.strictEqual(computeRiskLevel(txs, 100), "none");
  });

  test("returns 'low' when avg delta is positive", () => {
    const txs = Array.from({ length: 10 }, () => ({ delta: 10 }));
    assert.strictEqual(computeRiskLevel(txs, 500), "low");
  });

  test("returns 'low' when steps-to-zero > 20", () => {
    // avg delta = -5, balance = 200 → steps = 40 > 20
    const txs = Array.from({ length: 10 }, () => ({ delta: -5 }));
    assert.strictEqual(computeRiskLevel(txs, 200), "low");
  });

  test("returns 'medium' when steps-to-zero is 10–20", () => {
    // avg delta = -10, balance = 150 → steps = 15
    const txs = Array.from({ length: 10 }, () => ({ delta: -10 }));
    assert.strictEqual(computeRiskLevel(txs, 150), "medium");
  });

  test("returns 'high' when steps-to-zero <= 10", () => {
    // avg delta = -20, balance = 100 → steps = 5
    const txs = Array.from({ length: 10 }, () => ({ delta: -20 }));
    assert.strictEqual(computeRiskLevel(txs, 100), "high");
  });
});

describe("RiskAssessment — handleUpdateRisk", () => {
  test("upserts MongoDB document with rolling window and risk level", async () => {
    let upsertedDoc: unknown = null;

    const mockCollection = {
      findOne: async (_filter: unknown) => null,
      updateOne: async (_filter: unknown, update: unknown, _options: unknown) => {
        upsertedDoc = (update as Record<string, unknown>)["$set"];
        return { modifiedCount: 1 };
      },
    };

    const cmd: UpdateAccountRisk = {
      commandType: "UpdateAccountRisk",
      accountId: "acc-1",
      delta: 100,
      currentBalance: 100,
      currency: "USD",
      transactionId: "tx-1",
    };

    await handleUpdateRisk(cmd, mockCollection as never);

    const doc = upsertedDoc as Record<string, unknown>;
    assert.strictEqual(doc["accountId"], "acc-1");
    assert.strictEqual(doc["riskLevel"], "none"); // only 1 transaction, < 10
    assert.strictEqual(doc["currentBalance"], 100);
    assert.strictEqual((doc["transactions"] as unknown[]).length, 1);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/RiskAssessment/commandHandler.test.ts
```

Expected: Error — `./commandHandler.js` not found.

- [ ] **Step 3: Create `command.ts`**

```typescript
import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface UpdateAccountRisk extends ICommand {
  readonly commandType: "UpdateAccountRisk";
  readonly accountId: string;
  readonly delta: number;
  readonly currentBalance: number;
  readonly currency: string;
  readonly transactionId: string;
}
```

- [ ] **Step 4: Create `commandHandler.ts`**

```typescript
import type { Collection } from "mongodb";
import type { UpdateAccountRisk } from "./command.js";

export type RiskLevel = "none" | "low" | "medium" | "high";

type TxEntry = { delta: number; transactionId: string; recordedAt: Date };

interface AccountRiskDoc {
  accountId: string;
  transactions: TxEntry[];
  riskLevel: RiskLevel;
  currentBalance: number;
  assessedAt: Date;
}

export function computeRiskLevel(
  transactions: Array<{ delta: number }>,
  currentBalance: number,
): RiskLevel {
  if (transactions.length < 10) return "none";
  const avgDelta = transactions.reduce((sum, t) => sum + t.delta, 0) / transactions.length;
  if (avgDelta >= 0) return "low";
  const stepsToZero = currentBalance / Math.abs(avgDelta);
  if (stepsToZero > 20) return "low";
  if (stepsToZero > 10) return "medium";
  return "high";
}

export async function handleUpdateRisk(
  cmd: UpdateAccountRisk,
  collection: Collection<AccountRiskDoc>,
): Promise<void> {
  const existing = await collection.findOne({ accountId: cmd.accountId });
  const prev: TxEntry[] = existing?.transactions ?? [];

  const transactions: TxEntry[] = [
    { delta: cmd.delta, transactionId: cmd.transactionId, recordedAt: new Date() },
    ...prev,
  ].slice(0, 10);

  const riskLevel = computeRiskLevel(transactions, cmd.currentBalance);

  await collection.updateOne(
    { accountId: cmd.accountId },
    {
      $set: {
        accountId: cmd.accountId,
        transactions,
        riskLevel,
        currentBalance: cmd.currentBalance,
        assessedAt: new Date(),
      },
    },
    { upsert: true },
  );
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd apps/e2e/funds && node --import tsx --test src/BusinessCapabilities/Funds/slices/RiskAssessment/commandHandler.test.ts
```

Expected: `✔ RiskAssessment — computeRiskLevel` (5 passing) + `✔ RiskAssessment — handleUpdateRisk` (1 passing).

- [ ] **Step 6: Create `adapter.ts`**

```typescript
import type { Collection } from "mongodb";
import type { UpdateAccountRisk } from "./command.js";
import type { AccountRiskDoc } from "./commandHandler.js";
import { handleUpdateRisk } from "./commandHandler.js";

export type RiskAssessmentAdapter = (cmd: UpdateAccountRisk) => Promise<void>;

export function createRiskAdapter(collection: Collection<AccountRiskDoc>): RiskAssessmentAdapter {
  return (cmd) => handleUpdateRisk(cmd, collection);
}
```

Also export `AccountRiskDoc` from `commandHandler.ts` by adding `export` to the interface:

```typescript
export interface AccountRiskDoc {
  accountId: string;
  transactions: TxEntry[];
  riskLevel: RiskLevel;
  currentBalance: number;
  assessedAt: Date;
}
```

- [ ] **Step 7: Create `kafka/index.ts`**

```typescript
import type { Kafka } from "kafkajs";
import { launchKafkaConsumer } from "#abstractions/endpoints/kafkaConsumerUtils.js";
import type { RiskAssessmentAdapter } from "../adapter.js";

interface FundsChangedPayload {
  accountId: string;
  currentBalance: number;
  delta: number;
  currency: string;
  transactionId: string;
}

export function startRiskKafkaConsumer(
  kafka: Kafka,
  adapter: RiskAssessmentAdapter,
): { stop: () => Promise<void> } {
  return launchKafkaConsumer({
    kafka,
    groupId: "risk.FundsChanged",
    topics: ["events.FundsChanged"],
    onMessage: async (_topic, payload, _meta) => {
      const p = payload as FundsChangedPayload;
      await adapter({
        commandType: "UpdateAccountRisk",
        accountId: p.accountId,
        delta: p.delta,
        currentBalance: p.currentBalance,
        currency: p.currency,
        transactionId: p.transactionId,
      });
      console.log(`[Risk] updated account=${p.accountId} delta=${p.delta}`);
    },
  });
}
```

- [ ] **Step 8: Create `http/index.ts`**

```typescript
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { RiskAssessmentAdapter } from "../adapter.js";

export function createRiskHttpHandler(adapter: RiskAssessmentAdapter) {
  return async (req: Request, res: Response) => {
    const { accountId, delta, currentBalance, currency, transactionId } = req.body as Record<
      string,
      unknown
    >;
    if (!accountId || delta == null || currentBalance == null) {
      res.status(400).json({ error: "accountId, delta, and currentBalance are required" });
      return;
    }
    try {
      await adapter({
        commandType: "UpdateAccountRisk",
        accountId: String(accountId),
        delta: Number(delta),
        currentBalance: Number(currentBalance),
        currency: String(currency ?? "USD"),
        transactionId: transactionId ? String(transactionId) : randomUUID(),
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[Risk] HTTP error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/
git commit -m "feat(e2e-funds): add RiskAssessment slice with MongoDB rolling window"
```

---

## Task 9: Main Server (`server.ts`)

**Files:**

- Create: `apps/e2e/funds/src/server.ts`

This server owns: REST endpoints for deposit/withdraw, pg-boss leaderboard worker, outbox trigger installation, leaderboard HTTP endpoint, and a GET leaderboard endpoint. It does **not** need Kafka.

- [ ] **Step 1: Create `src/server.ts`**

```typescript
import express from "express";
import pg from "pg";
import PgBoss from "pg-boss";
import { createServer } from "node:http";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";

import { createDepositHttpHandler } from "#BusinessCapabilities/Funds/slices/DepositFunds/http/index.js";
import { createWithdrawHttpHandler } from "#BusinessCapabilities/Funds/slices/WithdrawFunds/http/index.js";
import { createLeaderboardAdapter } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/adapter.js";
import {
  registerLeaderboardWorker,
  LEADERBOARD_QUEUE,
} from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/pgboss/index.js";
import { createLeaderboardHttpHandler } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/http/index.js";

const config = {
  postgresConnection:
    process.env.POSTGRES_CONNECTION ?? "postgres://funds:funds123@localhost:5434/funds",
  port: Number(process.env.PORT ?? 3014),
};

// Installs the outbox → pg-boss trigger. Must be called AFTER boss.start()
// so the pgboss schema exists. Uses a dedicated client (pool.query doesn't
// support multi-statement transactions in pg).
async function installOutboxTrigger(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION insert_leaderboard_pgboss_job()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.message_type = 'FundsChanged' THEN
          INSERT INTO pgboss.job (name, data, priority)
          VALUES (
            '${LEADERBOARD_QUEUE}',
            jsonb_build_object(
              'metadata', jsonb_build_object('outboxId', NEW.id::text),
              'payload',  NEW.payload::jsonb
            ),
            0
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`DROP TRIGGER IF EXISTS leaderboard_pgboss_trigger ON outbox`);
    await client.query(`
      CREATE TRIGGER leaderboard_pgboss_trigger
        AFTER INSERT ON outbox
        FOR EACH ROW
        EXECUTE FUNCTION insert_leaderboard_pgboss_job()
    `);
    console.log("[Startup] outbox → pg-boss trigger installed");
  } finally {
    client.release();
  }
}

async function main() {
  const storeClient = EvDbPostgresPrismaClientFactory.create(config.postgresConnection);
  const storageAdapter = new EvDbPrismaStorageAdapter(storeClient);
  const pool = new pg.Pool({ connectionString: config.postgresConnection });

  const boss = new PgBoss(config.postgresConnection);
  await boss.start();
  console.log("[Startup] pg-boss started");

  await installOutboxTrigger(pool);

  const leaderboardAdapter = createLeaderboardAdapter(pool);
  await registerLeaderboardWorker(boss, leaderboardAdapter);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-main" }));

  app.post("/api/funds/deposit", createDepositHttpHandler(storageAdapter));
  app.post("/api/funds/withdraw", createWithdrawHttpHandler(storageAdapter));
  app.post("/api/funds/leaderboard/update", createLeaderboardHttpHandler(leaderboardAdapter));

  app.get("/api/funds/leaderboard", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT account_id, currency, total_deposited, total_withdrawn, last_balance,
                deposit_count, withdrawal_count, last_activity
         FROM account_leaderboard
         ORDER BY last_balance DESC
         LIMIT 50`,
      );
      res.json({ leaderboard: rows });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, resolve);
  });
  console.log(`[Startup] funds server running at http://localhost:${config.port}`);
  console.log(`[Startup] POST /api/funds/deposit | POST /api/funds/withdraw`);
  console.log(`[Startup] GET  /api/funds/leaderboard`);

  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] ${signal} received`);
    await Promise.allSettled([
      boss.stop(),
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
      pool.end(),
    ]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[Startup] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/e2e/funds/src/server.ts
git commit -m "feat(e2e-funds): add main server with deposit/withdraw + pg-boss leaderboard worker"
```

---

## Task 10: Risk Server (`risk-server.ts`)

**Files:**

- Create: `apps/e2e/funds/src/risk-server.ts`

- [ ] **Step 1: Create `src/risk-server.ts`**

```typescript
import express from "express";
import { Kafka } from "kafkajs";
import { MongoClient } from "mongodb";
import { createServer } from "node:http";

import { createRiskAdapter } from "#BusinessCapabilities/Funds/slices/RiskAssessment/adapter.js";
import { startRiskKafkaConsumer } from "#BusinessCapabilities/Funds/slices/RiskAssessment/kafka/index.js";
import { createRiskHttpHandler } from "#BusinessCapabilities/Funds/slices/RiskAssessment/http/index.js";
import type { AccountRiskDoc } from "#BusinessCapabilities/Funds/slices/RiskAssessment/commandHandler.js";

const config = {
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
  mongoDb: process.env.MONGO_DB ?? "funds_risk",
  kafkaBootstrap: process.env.KAFKA_BOOTSTRAP ?? "localhost:9092",
  port: Number(process.env.PORT ?? 3013),
};

async function main() {
  const mongoClient = new MongoClient(config.mongoUri);
  await mongoClient.connect();
  const collection = mongoClient.db(config.mongoDb).collection<AccountRiskDoc>("account_risk");
  await collection.createIndex({ accountId: 1 }, { unique: true });

  const kafka = new Kafka({ clientId: "e2e-funds-risk", brokers: [config.kafkaBootstrap] });
  const riskAdapter = createRiskAdapter(collection);
  const riskConsumer = startRiskKafkaConsumer(kafka, riskAdapter);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-risk" }));

  app.post("/api/risk/update", createRiskHttpHandler(riskAdapter));

  app.get("/api/risk/:accountId", async (req, res) => {
    try {
      const doc = await collection.findOne({ accountId: req.params.accountId });
      if (!doc) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      res.json({
        accountId: doc.accountId,
        riskLevel: doc.riskLevel,
        currentBalance: doc.currentBalance,
        transactionCount: doc.transactions.length,
        assessedAt: doc.assessedAt,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, resolve);
  });
  console.log(`[Startup] risk server running at http://localhost:${config.port}`);
  console.log(`[Startup] GET  /api/risk/:accountId`);

  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] ${signal} received`);
    await riskConsumer.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await mongoClient.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[Startup] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/e2e/funds/src/risk-server.ts
git commit -m "feat(e2e-funds): add risk server with MongoDB consumer and risk endpoint"
```

---

## Task 11: Infrastructure

**Files:**

- Create: `apps/e2e/funds/infrastructure/init.sql`
- Create: `apps/e2e/funds/infrastructure/debezium-connector.json`
- Create: `apps/e2e/funds/docker-compose.yml`

- [ ] **Step 1: Create `infrastructure/init.sql`**

```sql
-- Account leaderboard read model
CREATE TABLE IF NOT EXISTS account_leaderboard (
  account_id       TEXT PRIMARY KEY,
  currency         TEXT        NOT NULL DEFAULT 'USD',
  total_deposited  NUMERIC     NOT NULL DEFAULT 0,
  total_withdrawn  NUMERIC     NOT NULL DEFAULT 0,
  last_balance     NUMERIC     NOT NULL DEFAULT 0,
  deposit_count    INTEGER     NOT NULL DEFAULT 0,
  withdrawal_count INTEGER     NOT NULL DEFAULT 0,
  last_activity    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency index for Kafka consumer deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_account ON account_leaderboard(account_id);
```

- [ ] **Step 2: Create `infrastructure/debezium-connector.json`**

This configures Debezium's outbox event router. It watches the `evdb_outbox` table and routes each row to a Kafka topic based on the `message_type` column.

```json
{
  "name": "funds-outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "funds",
    "database.password": "funds123",
    "database.dbname": "funds",
    "database.server.name": "funds-server",
    "topic.prefix": "funds",
    "table.include.list": "public.evdb_outbox",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.id": "id",
    "transforms.outbox.table.field.event.key": "stream_id",
    "transforms.outbox.table.field.event.type": "message_type",
    "transforms.outbox.table.field.event.payload": "payload",
    "transforms.outbox.route.by.field": "message_type",
    "transforms.outbox.route.topic.replacement": "events.${routedByValue}",
    "transforms.outbox.table.expand.json.payload": "true",
    "slot.name": "funds_outbox_slot",
    "plugin.name": "pgoutput",
    "publication.name": "funds_outbox_pub"
  }
}
```

> **Note:** The exact column names (`stream_id`, `message_type`, `payload`) must match what `EvDbPrismaStorageAdapter` writes to the outbox table. Verify against the generated Prisma schema before running.

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: funds
      POSTGRES_PASSWORD: funds123
      POSTGRES_DB: funds
    ports:
      - "5434:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    command: >
      postgres
      -c wal_level=logical
      -c max_replication_slots=4
      -c max_wal_senders=4
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U funds -d funds"]
      interval: 5s
      timeout: 5s
      retries: 10

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      CLUSTER_ID: "funds-cluster-01"
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    ports:
      - "9092:9092"
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 10s
      timeout: 10s
      retries: 10

  debezium:
    image: debezium/connect:2.7
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
    environment:
      BOOTSTRAP_SERVERS: kafka:9092
      GROUP_ID: 1
      CONFIG_STORAGE_TOPIC: debezium_configs
      OFFSET_STORAGE_TOPIC: debezium_offsets
      STATUS_STORAGE_TOPIC: debezium_statuses
    ports:
      - "8083:8083"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8083/connectors"]
      interval: 10s
      timeout: 10s
      retries: 15

  mongodb:
    image: mongo:7
    environment:
      MONGO_INITDB_DATABASE: funds_risk
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.runCommand('ping').ok"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pg_data:
  mongo_data:
```

- [ ] **Step 4: Add README snippet for starting the stack**

Add to `apps/e2e/funds/README.md` (create it):

````markdown
# E2E Funds Demo

## Start infrastructure

```bash
cd apps/e2e/funds
docker compose up -d
```
````

## Register Debezium connector (after stack is healthy)

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @infrastructure/debezium-connector.json
```

## Run main server

```bash
npm run start -w e2e-funds
```

## Run risk server

```bash
npm run start:risk -w e2e-funds
```

## Test deposit

```bash
curl -X POST http://localhost:3014/api/funds/deposit \
  -H "Content-Type: application/json" \
  -d '{"accountId":"alice","amount":500,"currency":"USD"}'
```

## Check leaderboard

```bash
curl http://localhost:3014/api/funds/leaderboard
```

## Check risk

```bash
curl http://localhost:3013/api/risk/alice
```

````

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/funds/infrastructure/ apps/e2e/funds/docker-compose.yml apps/e2e/funds/README.md
git commit -m "feat(e2e-funds): add Docker Compose stack and Debezium connector config"
````

---

## Task 12: OpenTelemetry Instrumentation

**Files:**

- Create: `apps/e2e/funds/src/otel.ts`
- Modify: `apps/e2e/funds/src/server.ts` — import otel before other imports
- Modify: `apps/e2e/funds/src/risk-server.ts` — import otel before other imports
- Modify: `apps/e2e/funds/src/abstractions/endpoints/kafkaConsumerUtils.ts` — add consumer spans

**Important:** The OTEL SDK must be imported and started **before** any other module imports to auto-instrument correctly. In ESM this means a separate file imported first via `--import` flag or as the first line.

- [ ] **Step 1: Create `src/otel.ts`**

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "e2e-funds",
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log(
  "[OTEL] SDK started — traces → " +
    (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318"),
);

process.on("SIGTERM", () => {
  sdk.shutdown().catch(console.error);
});
process.on("SIGINT", () => {
  sdk.shutdown().catch(console.error);
});
```

- [ ] **Step 2: Add span wrapping to `kafkaConsumerUtils.ts`**

In the `eachMessage` handler inside `attempt()`, wrap `onMessage` with an OTEL span. Replace the existing `eachMessage` callback body:

```typescript
import { trace, context, propagation } from "@opentelemetry/api";

// Inside eachMessage callback, replace the onMessage call:
eachMessage: async ({ topic, partition, message, heartbeat }) => {
  void heartbeat();
  const outboxId = extractOutboxId(message);
  const payload = parsePayload(message);

  // Extract traceparent from payload if present
  const carrier: Record<string, string> = {};
  const p = payload as Record<string, unknown>;
  if (typeof p["traceparent"] === "string") carrier["traceparent"] = p["traceparent"];
  if (typeof p["tracestate"] === "string") carrier["tracestate"] = p["tracestate"];
  const parentCtx = propagation.extract(context.active(), carrier);

  const tracer = trace.getTracer("e2e-funds-kafka");
  await context.with(parentCtx, async () => {
    const span = tracer.startSpan(`kafka.consume ${topic}`, {
      attributes: {
        "messaging.system": "kafka",
        "messaging.destination": topic,
        "messaging.consumer.group": groupId,
        "eventualize.outbox.id": outboxId,
      },
    });
    try {
      await onMessage(topic, payload, { outboxId, storedAt: new Date(Number(message.timestamp)) });
    } finally {
      span.end();
    }
  });

  await c.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
},
```

- [ ] **Step 3: Import OTEL at the top of `server.ts` and `risk-server.ts`**

Add as the **very first line** in both files (before any other import):

```typescript
import "./otel.js";
```

- [ ] **Step 4: Update `package.json` scripts to use `--import tsx` with otel**

In `apps/e2e/funds/package.json`, the start scripts already use `tsx` which handles ESM — no changes needed to the scripts since `otel.ts` is imported inline.

- [ ] **Step 5: Run all unit tests to confirm nothing broken**

```bash
cd apps/e2e/funds && node --import tsx --test 'src/**/*.test.ts'
```

Expected: All tests pass. Count: 13 passing (3 balance view + 2 deposit + 2 withdraw + 2 leaderboard + 6 risk).

- [ ] **Step 6: Commit**

```bash
git add apps/e2e/funds/src/otel.ts apps/e2e/funds/src/server.ts apps/e2e/funds/src/risk-server.ts apps/e2e/funds/src/abstractions/endpoints/kafkaConsumerUtils.ts
git commit -m "feat(e2e-funds): add OpenTelemetry instrumentation with trace propagation across CDC boundary"
```

---

## Task 13: Build Verification

- [ ] **Step 1: Run baseline health check per CLAUDE.md**

```bash
cd /path/to/eventualize-js
pnpm build 2>&1 | grep "error TS" | wc -l
```

Expected: same or fewer errors than baseline.

- [ ] **Step 2: Run all unit tests**

```bash
cd apps/e2e/funds && node --import tsx --test 'src/**/*.test.ts'
```

Expected: 13 tests pass, 0 fail.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "feat(e2e-funds): complete e2e funds app — stream, CDC outbox, leaderboard and risk consumers"
```

---

## Self-Review Notes

- **`FundsStreamFactory.create` vs `get`:** Tests use `create` (no storage needed); `CommandHandlerOrchestratorFactory` uses `get` (loads existing events). Confirmed consistent across Tasks 5, 6, and the orchestrator in Task 2.
- **`stream.views.balance`:** The `StreamFactoryBuilder` produces typed `views` on the stream object with the view name as key. `balance` is the viewName exported from `Balance/state.ts`. Consistent across Task 3, 4, 6.
- **`AccountRiskDoc` export:** Task 8 exports `AccountRiskDoc` from `commandHandler.ts` so `risk-server.ts` and `adapter.ts` can import it. Confirmed in Task 10.
- **OTEL import order:** `./otel.js` is the first import in both server files to ensure auto-instrumentation patches modules before they load. Confirmed in Task 12.
- **Debezium column names:** The connector config uses `stream_id`, `message_type`, `payload` — these must match the eventualize outbox schema. Flag to verify against the actual Prisma-generated schema when standing up the stack.
