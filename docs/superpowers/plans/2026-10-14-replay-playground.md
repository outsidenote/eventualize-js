# Replay Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-k8s playground (backend + split-screen UI) to check stream replay (`goToOffset` + `forward`) by hand, deployed with `pnpm playground:deploy`.

**Architecture:** `apps/playground/backend` is an Express service over a new `PlaygroundFundsStreamFactory` and the Postgres Prisma adapter. It exposes commands (deposit/withdraw) and a batched replay endpoint. `apps/playground/frontend` is a Vite + React app: commands on the left, replay navigation with a client-side batch cache on the right. Kustomize manifests run Postgres, a Prisma migrate Job, the backend and an nginx frontend in namespace `evdb-playground` on Docker Desktop k8s.

**Tech Stack:** TypeScript 6, Node 24, Express 4, React 18, Vite 5, node:test + tsx, testcontainers Postgres, Prisma 7.10.0, Docker, kubectl + kustomize, nginx.

**Spec:** [docs/superpowers/specs/2026-10-14-replay-playground-design.md](../specs/2026-10-14-replay-playground-design.md)

## Global Constraints

- Package manager: `pnpm` only. Internal deps: `workspace:^`. Prisma packages pinned to exactly `7.10.0`.
- Reuse versions already in the repo: `express ^4.22.3`, `@types/express ^5.0.6`, `react ^18.3.1`, `react-dom ^18.3.1`, `@types/react ^18.3.31`, `@types/react-dom ^18.3.7`, `vite ^5.4.21`, `@vitejs/plugin-react ^4.7.0`, `@testcontainers/postgresql ^12.2.0`, `testcontainers ^12.2.0`, `pg ^8.23.1`, `@types/pg ^8.23.1`, `@types/node ^24.19.2`, `tsx ^4.23.15`, `typescript ^6.0.3`, `rimraf ^6.1.3`, `@opentelemetry/api ^1.9.1`. No pre-release versions.
- Type safety: no `any`, no `as` casts. `unknown` only at the HTTP boundary (request body / query / caught errors), narrowed at once with `typeof` / `in` checks.
- Stream type: `playground-funds`. Large transaction threshold: `10_000`. Risk range `0..10`.
- ESLint rule `@eventualize/enforce-stream-factory-module`: a file that imports `StreamFactoryBuilder` may only contain imports, one `const X = new StreamFactoryBuilder(...)...build()`, `export default X`, and `export type Y = typeof X.StreamType`. Put all helpers in other files.
- Imports use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports` is an error).
- Baseline (recorded 2026-10-14): `pnpm build` → 0 `error TS`; `pnpm exec eslint .` → 0 errors. Neither count may rise.
- **No `git commit` without explicit user approval.** Each task ends with "stage", not "commit".
- Kubectl context guard: scripts act only when `kubectl config current-context` is `docker-desktop`.

## Review Focus

1. **Malformed or hostile input** (bad JSON body, account id with `/` or spaces, `batchSize=0` or `9999`, negative offset) must give 400, never 500. Tests in Task 4.
2. **Fast clicking / slider dragging** must not show a stale batch: a late response for an old request is dropped (`requestId` guard in `useReplayCursor`). Manual check in Task 9 step list.
3. **Offset past the head** (`offset > lastOffset`) must give 404, and the UI clamps targets to `0..lastOffset`. Tests in Tasks 3, 4, 6.
4. **Decimal values** (`0.1 + 0.2`) must show as `0.3 USD` in the formatted view, while raw JSON shows the exact stored number. Test in Task 6.
5. **Snapshot vs. no-snapshot replay** must give the same views for every offset, also on real Postgres. Tests in Tasks 3 and 5.

---

## File Map

```
pnpm-workspace.yaml                                   modify: add apps/playground/*
tsconfig.json                                         modify: add backend reference
package.json                                          modify: playground:* scripts
.dockerignore                                         create
apps/playground/README.md                             create
apps/playground/backend/
  package.json, tsconfig.json, Dockerfile
  src/domain/streamType.ts        STREAM_TYPE const
  src/domain/events.ts            event payload types
  src/domain/views.ts             view states, defaults, pure handlers, PlaygroundViews, copyViews
  src/domain/messages.ts          LargeTransactionAlert producer
  src/domain/PlaygroundFundsStreamFactory.ts
  src/domain/PlaygroundFundsStreamFactory.test.ts
  src/storage.ts                  PlaygroundStorage type
  src/errors.ts                   ValidationError, NotFoundError
  src/commands/commands.ts        deposit, withdraw
  src/commands/commands.test.ts
  src/replay/replayBatch.ts       replayBatch + DTO types
  src/replay/replayBatch.test.ts
  src/accounts/getHead.ts
  src/accounts/listAccounts.ts
  src/http/validation.ts
  src/http/errorHandler.ts
  src/http/createApp.ts
  src/http/createApp.test.ts
  src/server.ts
  src/tests/InMemoryStorageAdapter.ts   copy of core test-support adapter
  src/tests/api.integration.test.ts
apps/playground/frontend/
  package.json, tsconfig.json, vite.config.ts, index.html, Dockerfile, nginx.conf
  src/api/types.ts, src/api/client.ts
  src/replayWindow.ts, src/replayWindow.test.ts
  src/format.ts, src/format.test.ts
  src/useReplayCursor.ts
  src/App.tsx, src/CommandsPane.tsx, src/ReplayPane.tsx, src/ReplayCard.tsx
  src/main.tsx, src/styles.css
apps/playground/k8s/
  kustomization.yaml, namespace.yaml, postgres.yaml, migrate-job.yaml, backend.yaml, frontend.yaml
scripts/playground/
  lib.sh, deploy.sh, destroy.sh, dev.sh
```

---

### Task 1: Backend package + domain (events, views, messages, factory)

**Files:**
- Modify: `pnpm-workspace.yaml`, `tsconfig.json`
- Create: `apps/playground/backend/package.json`, `apps/playground/backend/tsconfig.json`
- Create: `apps/playground/backend/src/domain/{streamType,events,views,messages,PlaygroundFundsStreamFactory}.ts`
- Create: `apps/playground/backend/src/tests/InMemoryStorageAdapter.ts`
- Test: `apps/playground/backend/src/domain/PlaygroundFundsStreamFactory.test.ts`

**Interfaces:**
- Produces: `STREAM_TYPE`; types `FundsDeposited`, `FundsWithdrawn`, `WithdrawalDenied`, `BalanceState`, `StatsState`, `PlaygroundViews`; `copyViews(views: Readonly<PlaygroundViews>): PlaygroundViews`; `LARGE_TRANSACTION`; `LARGE_TRANSACTION_ALERT`; default export `PlaygroundFundsStreamFactory` (methods `create`, `get`, `goToOffset`; stream methods `appendEventFundsDeposited`, `appendEventFundsWithdrawn`, `appendEventWithdrawalDenied`); default export `InMemoryStorageAdapter`.

- [ ] **Step 1: Workspace + package files**

`pnpm-workspace.yaml` — add a line under `packages:`:

```yaml
  - "apps/playground/*"
```

Root `tsconfig.json` — add to `references` after `./apps/otel-sample-app`:

```jsonc
    {
      "path": "./apps/playground/backend"
    },
```

`apps/playground/backend/package.json`:

```json
{
  "name": "playground-backend",
  "version": "1.0.0",
  "private": true,
  "description": "Replay playground backend: funds commands and batched goToOffset replay",
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "build": "tsc --build",
    "clean": "rimraf dist tsconfig.tsbuildinfo",
    "start": "node dist/server.js",
    "dev": "node --watch --import tsx src/server.ts",
    "test": "node --import tsx --test 'src/**/*.test.ts'"
  },
  "dependencies": {
    "@eventualize/core": "workspace:^",
    "@eventualize/postgres-storage-adapter": "workspace:^",
    "@eventualize/relational-storage-adapter": "workspace:^",
    "@eventualize/types": "workspace:^",
    "@opentelemetry/api": "^1.9.1",
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "express": "^4.22.3"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^12.2.0",
    "@types/express": "^5.0.6",
    "@types/node": "^24.19.2",
    "@types/pg": "^8.23.1",
    "pg": "^8.23.1",
    "rimraf": "^6.1.3",
    "testcontainers": "^12.2.0",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3"
  }
}
```

`apps/playground/backend/tsconfig.json`:

```jsonc
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true
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

Run: `pnpm install`
Expected: lockfile updated, no errors, no new peer warnings for `@prisma/*` or `@opentelemetry/api`.

- [ ] **Step 2: In-memory adapter for tests**

Copy `packages/core/src/store/InMemoryStorageAdapter.test-support.ts` to `apps/playground/backend/src/tests/InMemoryStorageAdapter.ts`. Change exactly one line:

```ts
import type { IEvDbStorageAdapter } from "../adapters/IEvDbStorageAdapter.js";
```

to

```ts
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
```

Also change the class doc comment to: `In-memory stream + snapshot adapter for playground unit tests (copy of the core test-support adapter).`

- [ ] **Step 3: Write the failing domain test**

`apps/playground/backend/src/domain/PlaygroundFundsStreamFactory.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import PlaygroundFundsStreamFactory from "./PlaygroundFundsStreamFactory.js";
import { LARGE_TRANSACTION_ALERT } from "./messages.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

describe("PlaygroundFundsStreamFactory views", () => {
  test("balance, stats and risk fold over all event types", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("alice", adapter, adapter);
    await stream.appendEventFundsDeposited({ description: "d", value: 100, currency: "USD" });
    await stream.appendEventFundsDeposited({ description: "d", value: 20_000, currency: "USD" });
    await stream.appendEventFundsWithdrawn({ description: "w", value: 50, currency: "USD" });
    await stream.appendEventWithdrawalDenied({
      description: "w",
      value: 1_000_000,
      currency: "USD",
      reason: "insufficient funds",
    });

    assert.deepStrictEqual(stream.views.balance, { amount: 20_050, currency: "USD" });
    assert.deepStrictEqual(stream.views.stats, { deposits: 2, withdrawals: 1, denied: 1 });
    // 0 → max(0, -0.5) = 0 → +3 = 3 → 3 → +2 +3 = 8
    assert.strictEqual(stream.views.risk, 8);
  });

  test("risk never goes below 0", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("bob", adapter, adapter);
    await stream.appendEventFundsDeposited({ description: "d", value: 1, currency: "USD" });
    await stream.appendEventFundsDeposited({ description: "d", value: 1, currency: "USD" });
    assert.strictEqual(stream.views.risk, 0);
  });

  test("risk is capped at 10", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("carol", adapter, adapter);
    for (let i = 0; i < 5; i++) {
      await stream.appendEventFundsDeposited({ description: "d", value: 50_000, currency: "USD" });
    }
    assert.strictEqual(stream.views.risk, 10);
  });

  test("large transactions produce LargeTransactionAlert, small ones do not", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("dave", adapter, adapter);
    await stream.appendEventFundsDeposited({ description: "d", value: 9_999, currency: "USD" });
    await stream.appendEventFundsDeposited({ description: "d", value: 10_000, currency: "USD" });

    const messages = stream.getMessages();
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].messageType, LARGE_TRANSACTION_ALERT);
    assert.deepStrictEqual(messages[0].payload, {
      eventType: "FundsDeposited",
      value: 10_000,
      currency: "USD",
      balanceAfter: 19_999,
    });
  });

  test("handlers do not change the default state objects", async () => {
    const adapter = new InMemoryStorageAdapter();
    const first = PlaygroundFundsStreamFactory.create("e1", adapter, adapter);
    await first.appendEventFundsDeposited({ description: "d", value: 5, currency: "EUR" });
    const second = PlaygroundFundsStreamFactory.create("e2", adapter, adapter);
    assert.deepStrictEqual(second.views.balance, { amount: 0, currency: "" });
    assert.deepStrictEqual(second.views.stats, { deposits: 0, withdrawals: 0, denied: 0 });
  });
});
```

- [ ] **Step 4: Run the test, expect failure**

Run: `node --import tsx --test apps/playground/backend/src/domain/PlaygroundFundsStreamFactory.test.ts`
Expected: FAIL — `Cannot find module './PlaygroundFundsStreamFactory.js'`.

- [ ] **Step 5: Write the domain files**

`src/domain/streamType.ts`:

```ts
/** Stream type of every playground account stream. */
export const STREAM_TYPE = "playground-funds";
```

`src/domain/events.ts`:

```ts
export type FundsDeposited = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
};

export type FundsWithdrawn = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
};

export type WithdrawalDenied = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
  readonly reason: string;
};
```

`src/domain/views.ts`:

```ts
import type { FundsDeposited, FundsWithdrawn, WithdrawalDenied } from "./events.js";

/** Any event with `value` at or above this is a large transaction. */
export const LARGE_TRANSACTION = 10_000;
const RISK_MAX = 10;

export type BalanceState = { readonly amount: number; readonly currency: string };
export type StatsState = {
  readonly deposits: number;
  readonly withdrawals: number;
  readonly denied: number;
};
export type PlaygroundViews = {
  readonly balance: BalanceState;
  readonly stats: StatsState;
  readonly risk: number;
};

export const balanceDefault: BalanceState = { amount: 0, currency: "" };
export const statsDefault: StatsState = { deposits: 0, withdrawals: 0, denied: 0 };
export const riskDefault: number = 0;

// All handlers are pure: they return a new state and never change `state`.

export const balanceOnDeposited = (state: BalanceState, e: FundsDeposited): BalanceState => ({
  amount: state.amount + e.value,
  currency: e.currency,
});
export const balanceOnWithdrawn = (state: BalanceState, e: FundsWithdrawn): BalanceState => ({
  amount: state.amount - e.value,
  currency: state.currency,
});

export const statsOnDeposited = (state: StatsState): StatsState => ({
  ...state,
  deposits: state.deposits + 1,
});
export const statsOnWithdrawn = (state: StatsState): StatsState => ({
  ...state,
  withdrawals: state.withdrawals + 1,
});
export const statsOnDenied = (state: StatsState): StatsState => ({
  ...state,
  denied: state.denied + 1,
});

const clampRisk = (risk: number): number => Math.min(RISK_MAX, Math.max(0, risk));
const largeBump = (value: number): number => (value >= LARGE_TRANSACTION ? 3 : 0);

export const riskOnDeposited = (state: number, e: FundsDeposited): number =>
  clampRisk(e.value >= LARGE_TRANSACTION ? state + 3 : state - 0.5);
export const riskOnWithdrawn = (state: number, e: FundsWithdrawn): number =>
  clampRisk(state + largeBump(e.value));
export const riskOnDenied = (state: number, e: WithdrawalDenied): number =>
  clampRisk(state + 2 + largeBump(e.value));

/** Deep copy of the view states. Use it before the source stream moves on. */
export function copyViews(views: Readonly<PlaygroundViews>): PlaygroundViews {
  return structuredClone({ balance: views.balance, stats: views.stats, risk: views.risk });
}
```

`src/domain/messages.ts`:

```ts
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { BalanceState } from "./views.js";
import { LARGE_TRANSACTION } from "./views.js";

export const LARGE_TRANSACTION_ALERT = "LargeTransactionAlert";

/** Outbox producer shared by all playground events. Fires for large transactions only. */
export function largeTransactionAlert(
  payload: { readonly value: number; readonly currency: string },
  views: { readonly balance: BalanceState },
  metadata: IEvDbEventMetadata,
): EvDbMessage[] {
  if (payload.value < LARGE_TRANSACTION) return [];
  return [
    EvDbMessage.createFromMetadata(metadata, LARGE_TRANSACTION_ALERT, {
      eventType: metadata.eventType,
      value: payload.value,
      currency: payload.currency,
      balanceAfter: views.balance.amount,
    }),
  ];
}
```

`src/domain/PlaygroundFundsStreamFactory.ts`:

```ts
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { FundsDeposited, FundsWithdrawn, WithdrawalDenied } from "./events.js";
import { STREAM_TYPE } from "./streamType.js";
import { largeTransactionAlert } from "./messages.js";
import {
  balanceDefault,
  balanceOnDeposited,
  balanceOnWithdrawn,
  riskDefault,
  riskOnDenied,
  riskOnDeposited,
  riskOnWithdrawn,
  statsDefault,
  statsOnDenied,
  statsOnDeposited,
  statsOnWithdrawn,
} from "./views.js";

const PlaygroundFundsStreamFactory = new StreamFactoryBuilder(STREAM_TYPE)
  .withEvent("FundsDeposited")
  .asType<FundsDeposited>()
  .withEvent("FundsWithdrawn")
  .asType<FundsWithdrawn>()
  .withEvent("WithdrawalDenied")
  .asType<WithdrawalDenied>()
  .withView("balance", balanceDefault, {
    FundsDeposited: balanceOnDeposited,
    FundsWithdrawn: balanceOnWithdrawn,
  })
  .withView("stats", statsDefault, {
    FundsDeposited: statsOnDeposited,
    FundsWithdrawn: statsOnWithdrawn,
    WithdrawalDenied: statsOnDenied,
  })
  .withView("risk", riskDefault, {
    FundsDeposited: riskOnDeposited,
    FundsWithdrawn: riskOnWithdrawn,
    WithdrawalDenied: riskOnDenied,
  })
  .withMessages("FundsDeposited", largeTransactionAlert)
  .withMessages("FundsWithdrawn", largeTransactionAlert)
  .withMessages("WithdrawalDenied", largeTransactionAlert)
  .build();

export default PlaygroundFundsStreamFactory;

export type PlaygroundFundsStream = typeof PlaygroundFundsStreamFactory.StreamType;
```

- [ ] **Step 6: Run the test, expect pass**

Run: `node --import tsx --test apps/playground/backend/src/domain/PlaygroundFundsStreamFactory.test.ts`
Expected: 5 tests pass.

- [ ] **Step 7: Build + lint gate**

Run: `pnpm build 2>&1 | grep "error TS" | wc -l` → `0`.
Run: `pnpm exec eslint apps/playground` → no errors.
Run: `pnpm exec prettier --write "apps/playground/**/*.ts"`

- [ ] **Step 8: Stage**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json apps/playground/backend
```

Do not commit (user approval needed).

---

### Task 2: Commands (deposit / withdraw)

**Files:**
- Create: `apps/playground/backend/src/storage.ts`, `src/errors.ts`, `src/commands/commands.ts`
- Test: `apps/playground/backend/src/commands/commands.test.ts`

**Interfaces:**
- Consumes: `PlaygroundFundsStreamFactory`, `PlaygroundViews`, `copyViews` (Task 1).
- Produces:
  - `type PlaygroundStorage = IEvDbStorageStreamAdapter & IEvDbStorageSnapshotAdapter`
  - `class ValidationError extends Error`, `class NotFoundError extends Error`
  - `type CommandInput = { readonly value: number; readonly currency: string; readonly description?: string }`
  - `type PlaygroundEventType = "FundsDeposited" | "FundsWithdrawn" | "WithdrawalDenied"`
  - `type CommandResult = { readonly offset: number; readonly eventType: PlaygroundEventType; readonly views: PlaygroundViews }`
  - `deposit(storage: PlaygroundStorage, streamId: string, input: CommandInput): Promise<CommandResult>`
  - `withdraw(storage: PlaygroundStorage, streamId: string, input: CommandInput): Promise<CommandResult>`
  - `INSUFFICIENT_FUNDS = "insufficient funds"`

- [ ] **Step 1: Write the failing test**

`src/commands/commands.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { deposit, withdraw } from "./commands.js";
import { ValidationError } from "../errors.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

describe("commands", () => {
  test("first deposit creates the account at offset 0", async () => {
    const storage = new InMemoryStorageAdapter();
    const result = await deposit(storage, "alice", { value: 100, currency: "USD" });
    assert.strictEqual(result.offset, 0);
    assert.strictEqual(result.eventType, "FundsDeposited");
    assert.deepStrictEqual(result.views.balance, { amount: 100, currency: "USD" });
  });

  test("withdraw within balance appends FundsWithdrawn", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 100, currency: "USD" });
    const result = await withdraw(storage, "alice", { value: 100, currency: "USD" });
    assert.strictEqual(result.offset, 1);
    assert.strictEqual(result.eventType, "FundsWithdrawn");
    assert.strictEqual(result.views.balance.amount, 0);
  });

  test("withdraw above balance appends WithdrawalDenied and keeps the balance", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 100, currency: "USD" });
    const result = await withdraw(storage, "alice", { value: 101, currency: "USD" });
    assert.strictEqual(result.eventType, "WithdrawalDenied");
    assert.strictEqual(result.views.balance.amount, 100);
    assert.strictEqual(result.views.stats.denied, 1);
  });

  test("withdraw on an empty account is denied", async () => {
    const storage = new InMemoryStorageAdapter();
    const result = await withdraw(storage, "ghost", { value: 1, currency: "USD" });
    assert.strictEqual(result.offset, 0);
    assert.strictEqual(result.eventType, "WithdrawalDenied");
  });

  test("a command in another currency is rejected and stores nothing", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 100, currency: "USD" });
    await assert.rejects(
      deposit(storage, "alice", { value: 1, currency: "EUR" }),
      (err) => err instanceof ValidationError,
    );
    const next = await deposit(storage, "alice", { value: 1, currency: "USD" });
    assert.strictEqual(next.offset, 1);
  });

  test("default descriptions are used when none is given", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 10, currency: "USD" });
    await withdraw(storage, "alice", { value: 5, currency: "USD", description: "rent" });
    const last = await storage.getLastOffsetAsync(new EvDbStreamAddress("playground-funds", "alice"));
    assert.strictEqual(last, 1);
  });
});
```

Add this import at the top of the test file:

```ts
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
```

- [ ] **Step 2: Run, expect failure**

Run: `node --import tsx --test apps/playground/backend/src/commands/commands.test.ts`
Expected: FAIL — `Cannot find module './commands.js'`.

- [ ] **Step 3: Implement**

`src/storage.ts`:

```ts
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";

/** One adapter that stores both events and view snapshots (Prisma adapter, in-memory test adapter). */
export type PlaygroundStorage = IEvDbStorageStreamAdapter & IEvDbStorageSnapshotAdapter;
```

`src/errors.ts`:

```ts
/** Bad client input. Maps to HTTP 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Unknown account or offset. Maps to HTTP 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
```

`src/commands/commands.ts`:

```ts
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import type { PlaygroundFundsStream } from "../domain/PlaygroundFundsStreamFactory.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { ValidationError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export const INSUFFICIENT_FUNDS = "insufficient funds";

export type CommandInput = {
  readonly value: number;
  readonly currency: string;
  readonly description?: string;
};

export type PlaygroundEventType = "FundsDeposited" | "FundsWithdrawn" | "WithdrawalDenied";

export type CommandResult = {
  readonly offset: number;
  readonly eventType: PlaygroundEventType;
  readonly views: PlaygroundViews;
};

async function load(storage: PlaygroundStorage, streamId: string): Promise<PlaygroundFundsStream> {
  return PlaygroundFundsStreamFactory.get(streamId, storage, storage);
}

/** The account currency is fixed by the first deposit. */
function assertCurrency(stream: PlaygroundFundsStream, currency: string): void {
  const accountCurrency = stream.views.balance.currency;
  if (accountCurrency !== "" && accountCurrency !== currency) {
    throw new ValidationError(`account currency is ${accountCurrency}, got ${currency}`);
  }
}

function toResult(stream: PlaygroundFundsStream, eventType: PlaygroundEventType): CommandResult {
  return { offset: stream.storedOffset, eventType, views: copyViews(stream.views) };
}

export async function deposit(
  storage: PlaygroundStorage,
  streamId: string,
  input: CommandInput,
): Promise<CommandResult> {
  const stream = await load(storage, streamId);
  assertCurrency(stream, input.currency);
  await stream.appendEventFundsDeposited({
    description: input.description ?? "deposit",
    value: input.value,
    currency: input.currency,
  });
  await stream.store();
  return toResult(stream, "FundsDeposited");
}

/** Appends FundsWithdrawn when the balance covers `value`, otherwise WithdrawalDenied. */
export async function withdraw(
  storage: PlaygroundStorage,
  streamId: string,
  input: CommandInput,
): Promise<CommandResult> {
  const stream = await load(storage, streamId);
  assertCurrency(stream, input.currency);
  const payload = {
    description: input.description ?? "withdrawal",
    value: input.value,
    currency: input.currency,
  };
  if (stream.views.balance.amount >= input.value) {
    await stream.appendEventFundsWithdrawn(payload);
    await stream.store();
    return toResult(stream, "FundsWithdrawn");
  }
  await stream.appendEventWithdrawalDenied({ ...payload, reason: INSUFFICIENT_FUNDS });
  await stream.store();
  return toResult(stream, "WithdrawalDenied");
}
```

- [ ] **Step 4: Run, expect pass**

Run: `node --import tsx --test apps/playground/backend/src/commands/commands.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Gate + stage**

Run the build and lint counts (both `0`), `prettier --write "apps/playground/**/*.ts"`, then `git add apps/playground/backend`.

---

### Task 3: Replay batch

**Files:**
- Create: `apps/playground/backend/src/replay/replayBatch.ts`
- Test: `apps/playground/backend/src/replay/replayBatch.test.ts`

**Interfaces:**
- Consumes: `PlaygroundFundsStreamFactory`, `copyViews`, `STREAM_TYPE`, `PlaygroundStorage`, `NotFoundError`, `deposit`/`withdraw` (tests only).
- Produces:
  - `type EventMeta = { eventType: string; capturedAt: string; capturedBy: string; storedAt: string | null; traceparent: string | null }`
  - `type MessageDto = { messageType: string; payload: IEvDbPayloadData | null }`
  - `type ReplayItem = { offset: number; event_meta: EventMeta; event_payload: IEvDbPayloadData; views: PlaygroundViews; messages: MessageDto[] }`
  - `type ReplayBatch = { streamId: string; lastOffset: number; isHead: boolean; items: ReplayItem[] }`
  - `type ReplayOptions = { offset: number; batchSize: number; snapshots: boolean }`
  - `replayBatch(storage: PlaygroundStorage, streamId: string, options: ReplayOptions): Promise<ReplayBatch>`

- [ ] **Step 1: Write the failing test**

`src/replay/replayBatch.test.ts`:

```ts
import { test, describe, beforeEach } from "node:test";
import * as assert from "node:assert";
import { replayBatch } from "./replayBatch.js";
import type { ReplayItem } from "./replayBatch.js";
import { deposit, withdraw } from "../commands/commands.js";
import { NotFoundError } from "../errors.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

let storage: InMemoryStorageAdapter;

async function seed(): Promise<void> {
  storage = new InMemoryStorageAdapter();
  await deposit(storage, "alice", { value: 100, currency: "USD" }); // 0
  await deposit(storage, "alice", { value: 10, currency: "USD" }); // 1
  await deposit(storage, "alice", { value: 100_000, currency: "USD" }); // 2 (large)
  await withdraw(storage, "alice", { value: 50, currency: "USD" }); // 3
  await withdraw(storage, "alice", { value: 999_999, currency: "USD" }); // 4 (denied)
}

const strip = (i: ReplayItem) => ({
  offset: i.offset,
  eventType: i.event_meta.eventType,
  payload: i.event_payload,
  views: i.views,
  messages: i.messages,
});

describe("replayBatch", () => {
  beforeEach(seed);

  test("returns batchSize items starting at offset", async () => {
    const batch = await replayBatch(storage, "alice", { offset: 1, batchSize: 2, snapshots: true });
    assert.deepStrictEqual(
      batch.items.map((i) => i.offset),
      [1, 2],
    );
    assert.strictEqual(batch.isHead, false);
    assert.strictEqual(batch.lastOffset, 4);
    assert.deepStrictEqual(batch.items[1].views.balance, { amount: 100_110, currency: "USD" });
    assert.strictEqual(batch.items[1].messages[0].messageType, "LargeTransactionAlert");
  });

  test("stops at the head and reports isHead", async () => {
    const batch = await replayBatch(storage, "alice", { offset: 3, batchSize: 20, snapshots: true });
    assert.deepStrictEqual(
      batch.items.map((i) => i.offset),
      [3, 4],
    );
    assert.strictEqual(batch.isHead, true);
    assert.strictEqual(batch.items[1].event_meta.eventType, "WithdrawalDenied");
    assert.strictEqual(batch.items[1].event_payload.reason, "insufficient funds");
  });

  test("items do not share view objects", async () => {
    const batch = await replayBatch(storage, "alice", { offset: 0, batchSize: 5, snapshots: true });
    const amounts = batch.items.map((i) => i.views.balance.amount);
    assert.deepStrictEqual(amounts, [100, 110, 100_110, 100_060, 100_060]);
    assert.notStrictEqual(batch.items[0].views.balance, batch.items[1].views.balance);
    assert.notStrictEqual(batch.items[0].views.stats, batch.items[1].views.stats);
  });

  test("stepping inside a batch equals a direct go-to for every offset", async () => {
    const full = await replayBatch(storage, "alice", { offset: 0, batchSize: 200, snapshots: true });
    for (let offset = 0; offset <= 4; offset++) {
      const direct = await replayBatch(storage, "alice", { offset, batchSize: 1, snapshots: true });
      assert.deepStrictEqual(strip(direct.items[0]), strip(full.items[offset]));
    }
  });

  test("replay with and without snapshots gives the same items", async () => {
    for (let offset = 0; offset <= 4; offset++) {
      const withSnap = await replayBatch(storage, "alice", { offset, batchSize: 3, snapshots: true });
      const noSnap = await replayBatch(storage, "alice", { offset, batchSize: 3, snapshots: false });
      assert.deepStrictEqual(withSnap.items.map(strip), noSnap.items.map(strip));
    }
  });

  test("event_meta has ISO dates and nulls for missing fields", async () => {
    const batch = await replayBatch(storage, "alice", { offset: 0, batchSize: 1, snapshots: true });
    const meta = batch.items[0].event_meta;
    assert.strictEqual(meta.eventType, "FundsDeposited");
    assert.ok(!Number.isNaN(Date.parse(meta.capturedAt)));
    assert.ok(meta.storedAt === null || !Number.isNaN(Date.parse(meta.storedAt)));
    assert.ok(meta.traceparent === null || typeof meta.traceparent === "string");
  });

  test("unknown account is NotFoundError", async () => {
    await assert.rejects(
      replayBatch(storage, "nobody", { offset: 0, batchSize: 1, snapshots: true }),
      (err) => err instanceof NotFoundError,
    );
  });

  test("offset past the head is NotFoundError", async () => {
    await assert.rejects(
      replayBatch(storage, "alice", { offset: 5, batchSize: 1, snapshots: true }),
      (err) => err instanceof NotFoundError,
    );
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --import tsx --test apps/playground/backend/src/replay/replayBatch.test.ts`
Expected: FAIL — `Cannot find module './replayBatch.js'`.

- [ ] **Step 3: Implement**

`src/replay/replayBatch.ts`:

```ts
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import { STREAM_TYPE } from "../domain/streamType.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export type EventMeta = {
  readonly eventType: string;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly storedAt: string | null;
  readonly traceparent: string | null;
};

export type MessageDto = {
  readonly messageType: string;
  readonly payload: IEvDbPayloadData | null;
};

export type ReplayItem = {
  readonly offset: number;
  readonly event_meta: EventMeta;
  readonly event_payload: IEvDbPayloadData;
  readonly views: PlaygroundViews;
  readonly messages: MessageDto[];
};

export type ReplayBatch = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly isHead: boolean;
  readonly items: ReplayItem[];
};

export type ReplayOptions = {
  readonly offset: number;
  readonly batchSize: number;
  readonly snapshots: boolean;
};

/** Snapshot of the read-only stream at its current position. Deep-copied: `forward()` mutates the stream. */
function toItem(stream: IEvDbReadOnlyStream<PlaygroundViews>): ReplayItem {
  const e = stream.event;
  return {
    offset: e.streamCursor.offset,
    event_meta: {
      eventType: e.eventType,
      capturedAt: e.capturedAt.toISOString(),
      capturedBy: e.capturedBy,
      storedAt: e.storedAt ? e.storedAt.toISOString() : null,
      traceparent: e.traceparent ?? null,
    },
    event_payload: structuredClone(e.payload),
    views: copyViews(stream.views),
    messages: stream.messages.map((m) => ({
      messageType: m.messageType,
      payload: m.payload === undefined ? null : structuredClone(m.payload),
    })),
  };
}

/**
 * Opens the stream at `offset` with `goToOffset` and steps forward until the batch
 * holds `batchSize` items or the stream reaches its head.
 */
export async function replayBatch(
  storage: PlaygroundStorage,
  streamId: string,
  options: ReplayOptions,
): Promise<ReplayBatch> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  if (options.offset > lastOffset) {
    throw new NotFoundError(`no event at offset ${options.offset} (last offset ${lastOffset})`);
  }

  const stream = await PlaygroundFundsStreamFactory.goToOffset(
    streamId,
    options.offset,
    storage,
    options.snapshots ? storage : undefined,
  );

  const items: ReplayItem[] = [toItem(stream)];
  while (items.length < options.batchSize && !stream.isHead) {
    const before = stream.event.streamCursor.offset;
    await stream.forward();
    if (stream.event.streamCursor.offset === before) break;
    items.push(toItem(stream));
  }

  const lastItemOffset = items[items.length - 1].offset;
  return { streamId, lastOffset: Math.max(lastOffset, lastItemOffset), isHead: stream.isHead, items };
}
```

If `goToOffset`'s return type does not match `IEvDbReadOnlyStream<PlaygroundViews>` (its `TViews` is an intersection), change `toItem`'s parameter type to `Awaited<ReturnType<typeof PlaygroundFundsStreamFactory.goToOffset>>`. Do not cast.

- [ ] **Step 4: Run, expect pass**

Run: `node --import tsx --test apps/playground/backend/src/replay/replayBatch.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Gate + stage**

Build + lint counts `0`, prettier, `git add apps/playground/backend`.

---

### Task 4: HTTP layer + server

**Files:**
- Create: `src/accounts/getHead.ts`, `src/accounts/listAccounts.ts`, `src/http/validation.ts`, `src/http/errorHandler.ts`, `src/http/createApp.ts`, `src/server.ts` (all under `apps/playground/backend/`)
- Test: `apps/playground/backend/src/http/createApp.test.ts`

**Interfaces:**
- Consumes: `deposit`, `withdraw`, `CommandInput` (Task 2), `replayBatch`, `ReplayOptions` (Task 3), `PlaygroundStorage`, errors.
- Produces:
  - `type AccountHead = { streamId: string; lastOffset: number; views: PlaygroundViews }`
  - `getHead(storage: PlaygroundStorage, streamId: string): Promise<AccountHead>`
  - `createListAccounts(prisma: PrismaClient): () => Promise<string[]>`
  - `parseAccountId(raw: string): string`, `parseCommandBody(body: unknown): CommandInput`, `parseReplayQuery(query: { readonly [key: string]: unknown }): ReplayOptions`
  - `statusFor(err: Error): number`, `errorHandler`
  - `type AppDeps = { storage: PlaygroundStorage; listAccounts: () => Promise<string[]> }`, `createApp(deps: AppDeps): Express`
  - Constants: `MAX_BATCH_SIZE = 200`, `DEFAULT_BATCH_SIZE = 20`

- [ ] **Step 1: Write the failing HTTP test**

`src/http/createApp.test.ts`:

```ts
import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { once } from "node:events";
import type { Server } from "node:http";
import { createApp } from "./createApp.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

let server: Server;
let base: string;

before(async () => {
  const storage = new InMemoryStorageAdapter();
  server = createApp({ storage, listAccounts: async () => ["alice"] }).listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

const post = (path: string, body: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });

describe("HTTP API", () => {
  test("GET /api/health", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: "ok" });
  });

  test("GET /api/accounts uses listAccounts", async () => {
    const res = await fetch(`${base}/api/accounts`);
    assert.deepStrictEqual(await res.json(), { accounts: ["alice"] });
  });

  test("deposit, withdraw, head, replay round trip", async () => {
    let res = await post("/api/accounts/alice/deposit", JSON.stringify({ value: 100, currency: "USD" }));
    assert.strictEqual(res.status, 200);
    res = await post("/api/accounts/alice/withdraw", JSON.stringify({ value: 500, currency: "USD" }));
    const denied = await res.json();
    assert.strictEqual(denied.eventType, "WithdrawalDenied");

    res = await fetch(`${base}/api/accounts/alice`);
    const head = await res.json();
    assert.strictEqual(head.lastOffset, 1);

    res = await fetch(`${base}/api/accounts/alice/replay?offset=0&batchSize=5&snapshots=false`);
    assert.strictEqual(res.status, 200);
    const batch = await res.json();
    assert.strictEqual(batch.items.length, 2);
    assert.strictEqual(batch.isHead, true);
  });

  test("400 on bad input", async () => {
    const cases: Array<[string, string]> = [
      ["/api/accounts/alice/deposit", JSON.stringify({ value: -1, currency: "USD" })],
      ["/api/accounts/alice/deposit", JSON.stringify({ value: "10", currency: "USD" })],
      ["/api/accounts/alice/deposit", JSON.stringify({ value: 10, currency: "usd" })],
      ["/api/accounts/alice/deposit", JSON.stringify({ value: 10, currency: "USD", description: 5 })],
      ["/api/accounts/alice/deposit", "{not json"],
      ["/api/accounts/bad%20name/deposit", JSON.stringify({ value: 10, currency: "USD" })],
    ];
    for (const [path, body] of cases) {
      const res = await post(path, body);
      assert.strictEqual(res.status, 400, `${path} ${body}`);
      assert.ok(typeof (await res.json()).error === "string");
    }
  });

  test("400 on currency mismatch", async () => {
    await post("/api/accounts/eur/deposit", JSON.stringify({ value: 1, currency: "EUR" }));
    const res = await post("/api/accounts/eur/deposit", JSON.stringify({ value: 1, currency: "USD" }));
    assert.strictEqual(res.status, 400);
  });

  test("400 on bad replay query", async () => {
    for (const q of ["offset=-1", "offset=abc", "", "offset=0&batchSize=0", "offset=0&batchSize=201", "offset=0&snapshots=maybe"]) {
      const res = await fetch(`${base}/api/accounts/alice/replay?${q}`);
      assert.strictEqual(res.status, 400, q);
    }
  });

  test("404 on unknown account and offset past head", async () => {
    assert.strictEqual((await fetch(`${base}/api/accounts/nobody`)).status, 404);
    assert.strictEqual((await fetch(`${base}/api/accounts/nobody/replay?offset=0`)).status, 404);
    assert.strictEqual((await fetch(`${base}/api/accounts/alice/replay?offset=99`)).status, 404);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --import tsx --test apps/playground/backend/src/http/createApp.test.ts`
Expected: FAIL — `Cannot find module './createApp.js'`.

- [ ] **Step 3: Implement accounts**

`src/accounts/getHead.ts`:

```ts
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import { STREAM_TYPE } from "../domain/streamType.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export type AccountHead = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly views: PlaygroundViews;
};

export async function getHead(storage: PlaygroundStorage, streamId: string): Promise<AccountHead> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  const stream = await PlaygroundFundsStreamFactory.get(streamId, storage, storage);
  return { streamId, lastOffset, views: copyViews(stream.views) };
}
```

`src/accounts/listAccounts.ts`:

```ts
import type { PrismaClient } from "@eventualize/relational-storage-adapter/EvDbPrismaClient";
import { STREAM_TYPE } from "../domain/streamType.js";

/**
 * The library has no "list streams" API, so this reads the events table directly.
 * Keep all direct table access in this module.
 */
export function createListAccounts(prisma: PrismaClient): () => Promise<string[]> {
  return async () => {
    const rows = await prisma.events.findMany({
      where: { stream_type: STREAM_TYPE },
      distinct: ["stream_id"],
      select: { stream_id: true },
      orderBy: { stream_id: "asc" },
    });
    return rows.map((r) => r.stream_id);
  };
}
```

- [ ] **Step 4: Implement validation**

`src/http/validation.ts`:

```ts
import type { CommandInput } from "../commands/commands.js";
import { ValidationError } from "../errors.js";
import type { ReplayOptions } from "../replay/replayBatch.js";

export const DEFAULT_BATCH_SIZE = 20;
export const MAX_BATCH_SIZE = 200;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const INTEGER = /^\d+$/;

export function parseAccountId(raw: string): string {
  if (!ACCOUNT_ID.test(raw)) {
    throw new ValidationError("account id must be 1-64 chars: letters, digits, '-' or '_'");
  }
  return raw;
}

export function parseCommandBody(body: unknown): CommandInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("body must be a JSON object");
  }
  const value = "value" in body ? body.value : undefined;
  const currency = "currency" in body ? body.currency : undefined;
  const description = "description" in body ? body.description : undefined;

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError("value must be a number greater than 0");
  }
  if (typeof currency !== "string" || !CURRENCY.test(currency)) {
    throw new ValidationError("currency must be a 3-letter upper-case code");
  }
  if (description !== undefined && typeof description !== "string") {
    throw new ValidationError("description must be a string");
  }
  const trimmed = description?.trim();
  return trimmed ? { value, currency, description: trimmed } : { value, currency };
}

function parseInteger(raw: unknown, name: string, min: number, max: number): number {
  if (typeof raw !== "string" || !INTEGER.test(raw)) {
    throw new ValidationError(`${name} must be an integer`);
  }
  const n = Number(raw);
  if (n < min || n > max) throw new ValidationError(`${name} must be between ${min} and ${max}`);
  return n;
}

export function parseReplayQuery(query: { readonly [key: string]: unknown }): ReplayOptions {
  const offset = parseInteger(query.offset, "offset", 0, Number.MAX_SAFE_INTEGER);
  const batchSize =
    query.batchSize === undefined
      ? DEFAULT_BATCH_SIZE
      : parseInteger(query.batchSize, "batchSize", 1, MAX_BATCH_SIZE);
  const rawSnapshots = query.snapshots;
  if (rawSnapshots !== undefined && rawSnapshots !== "true" && rawSnapshots !== "false") {
    throw new ValidationError("snapshots must be true or false");
  }
  return { offset, batchSize, snapshots: rawSnapshots !== "false" };
}
```

Note: `"-1"` fails the `INTEGER` regex, so negative offsets give 400.

- [ ] **Step 5: Implement error handler + app + server**

`src/http/errorHandler.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import OCCException from "@eventualize/types/primitives/OCCException";
import { NotFoundError, ValidationError } from "../errors.js";

export function statusFor(err: Error): number {
  if (err instanceof ValidationError) return 400;
  // express.json() raises SyntaxError for a malformed body.
  if (err instanceof SyntaxError) return 400;
  // goToOffset throws RangeError when the stream has no event at the offset.
  if (err instanceof NotFoundError || err instanceof RangeError) return 404;
  if (err instanceof OCCException || err.name === "OCCException") return 409;
  return 500;
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const status = statusFor(err);
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? "internal error" : err.message });
}
```

`src/http/createApp.ts`:

```ts
import express from "express";
import type { Express, Request, RequestHandler, Response } from "express";
import { getHead } from "../accounts/getHead.js";
import { deposit, withdraw } from "../commands/commands.js";
import { replayBatch } from "../replay/replayBatch.js";
import type { PlaygroundStorage } from "../storage.js";
import { errorHandler } from "./errorHandler.js";
import { parseAccountId, parseCommandBody, parseReplayQuery } from "./validation.js";

export type AppDeps = {
  readonly storage: PlaygroundStorage;
  readonly listAccounts: () => Promise<string[]>;
};

/** Express 4 does not forward rejected promises; route them to the error handler. */
const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export function createApp({ storage, listAccounts }: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get(
    "/api/accounts",
    handle(async (_req, res) => {
      res.json({ accounts: await listAccounts() });
    }),
  );

  app.get(
    "/api/accounts/:id",
    handle(async (req, res) => {
      res.json(await getHead(storage, parseAccountId(req.params.id)));
    }),
  );

  app.post(
    "/api/accounts/:id/deposit",
    handle(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await deposit(storage, id, parseCommandBody(req.body)));
    }),
  );

  app.post(
    "/api/accounts/:id/withdraw",
    handle(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await withdraw(storage, id, parseCommandBody(req.body)));
    }),
  );

  app.get(
    "/api/accounts/:id/replay",
    handle(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await replayBatch(storage, id, parseReplayQuery(req.query)));
    }),
  );

  app.use(errorHandler);
  return app;
}
```

`src/server.ts`:

```ts
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import { createListAccounts } from "./accounts/listAccounts.js";
import { createApp } from "./http/createApp.js";

const prisma = EvDbPostgresPrismaClientFactory.create(); // reads POSTGRES_CONNECTION
const storage = new EvDbPrismaStorageAdapter(prisma);
const app = createApp({ storage, listAccounts: createListAccounts(prisma) });

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`playground-backend listening on :${port}`);
});

function shutdown(): void {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

- [ ] **Step 6: Run, expect pass**

Run: `node --import tsx --test apps/playground/backend/src/http/createApp.test.ts`
Expected: 7 tests pass.

- [ ] **Step 7: Gate + stage**

Build + lint counts `0`, prettier, `git add apps/playground/backend`.

---

### Task 5: Postgres integration test

**Files:**
- Test: `apps/playground/backend/src/tests/api.integration.test.ts`

**Interfaces:**
- Consumes: `createApp`, `createListAccounts`, `EvDbPostgresPrismaClientFactory`, `EvDbPrismaStorageAdapter`, Prisma migrations in `packages/adapters/postgres-storage-adapter/prisma/migrations/*/migration.sql`.

- [ ] **Step 1: Check the environment first**

Run: `docker info --format '{{.ServerVersion}}'`
Expected: a version string. If it fails, start Docker Desktop before going on (environment issue, not a code bug).

- [ ] **Step 2: Write the test**

`src/tests/api.integration.test.ts`:

```ts
import { test, describe, before, after } from "node:test";
import * as assert from "node:assert";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import pg from "pg";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import type { PrismaClient } from "@eventualize/relational-storage-adapter/EvDbPrismaClient";
import { createListAccounts } from "../accounts/listAccounts.js";
import { createApp } from "../http/createApp.js";
import type { ReplayBatch, ReplayItem } from "../replay/replayBatch.js";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../../../packages/adapters/postgres-storage-adapter/prisma/migrations", import.meta.url),
);

/** Applies the same Prisma migrations the k8s migrate Job runs. */
async function migrate(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      await client.query(await readFile(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
    }
  } finally {
    await client.end();
  }
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let server: Server;
let base: string;

const send = (path: string, body: object) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function replay(offset: number, batchSize: number, snapshots: boolean): Promise<ReplayBatch> {
  const res = await fetch(
    `${base}/api/accounts/alice/replay?offset=${offset}&batchSize=${batchSize}&snapshots=${snapshots}`,
  );
  assert.strictEqual(res.status, 200);
  return res.json();
}

const strip = (i: ReplayItem) => ({
  offset: i.offset,
  eventType: i.event_meta.eventType,
  payload: i.event_payload,
  views: i.views,
  messages: i.messages,
});

describe("playground API on Postgres", { timeout: 180_000 }, () => {
  before(async () => {
    container = await new PostgreSqlContainer("postgres:18").start();
    const uri = container.getConnectionUri();
    await migrate(uri);
    prisma = EvDbPostgresPrismaClientFactory.create(uri);
    const app = createApp({
      storage: new EvDbPrismaStorageAdapter(prisma),
      listAccounts: createListAccounts(prisma),
    });
    server = app.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    base = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    server?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  test("commands, list, and replay consistency", async () => {
    const commands: Array<["deposit" | "withdraw", number]> = [
      ["deposit", 100],
      ["deposit", 10],
      ["deposit", 100_000],
      ["withdraw", 50],
      ["withdraw", 999_999],
      ["deposit", 0.1],
      ["deposit", 0.2],
      ["withdraw", 20_000],
    ];
    for (const [kind, value] of commands) {
      const res = await send(`/api/accounts/alice/${kind}`, { value, currency: "USD" });
      assert.strictEqual(res.status, 200);
    }
    await send("/api/accounts/bob/deposit", { value: 1, currency: "EUR" });

    const accounts = await (await fetch(`${base}/api/accounts`)).json();
    assert.deepStrictEqual(accounts, { accounts: ["alice", "bob"] });

    const reference = await replay(0, 200, false);
    assert.strictEqual(reference.items.length, commands.length);
    assert.strictEqual(reference.isHead, true);
    assert.strictEqual(reference.items[4].event_meta.eventType, "WithdrawalDenied");

    for (const batchSize of [1, 3, 20]) {
      for (let offset = 0; offset < commands.length; offset++) {
        const batch = await replay(offset, batchSize, true);
        const expected = reference.items.slice(offset, offset + batchSize).map(strip);
        assert.deepStrictEqual(batch.items.map(strip), expected, `offset=${offset} batch=${batchSize}`);
      }
    }
  });
});
```

- [ ] **Step 3: Run**

Run: `TEST_CONTAINER=true node --import tsx --test apps/playground/backend/src/tests/api.integration.test.ts`
Expected: 1 test passes. If the container fails to start, rule out the environment first (Docker running, image pull, port use) before changing code.

- [ ] **Step 4: Gate + stage**

Build + lint counts `0`, prettier, `git add apps/playground/backend`.

---

### Task 6: Frontend package + pure logic (window, format, API client)

**Files:**
- Create: `apps/playground/frontend/{package.json,tsconfig.json,vite.config.ts,index.html}`
- Create: `apps/playground/frontend/src/{api/types.ts,api/client.ts,replayWindow.ts,format.ts}`
- Test: `apps/playground/frontend/src/replayWindow.test.ts`, `apps/playground/frontend/src/format.test.ts`

**Interfaces:**
- Produces:
  - `api/types.ts`: `BalanceState`, `StatsState`, `PlaygroundViews`, `EventMeta`, `EventPayload`, `MessageDto`, `ReplayItem`, `ReplayBatch`, `AccountHead`, `CommandInput`, `CommandResult` (mirror of backend DTOs)
  - `api/client.ts`: `class ApiError extends Error { status: number }`, `listAccounts(): Promise<string[]>`, `getHead(id): Promise<AccountHead>`, `deposit(id, input): Promise<CommandResult>`, `withdraw(id, input): Promise<CommandResult>`, `replay(id, offset, batchSize, snapshots): Promise<ReplayBatch>`
  - `replayWindow.ts`: `type CacheWindow = { start: number; end: number }`, `type MovePlan = { kind: "cached"; target } | { kind: "fetch"; target; fetchOffset }`, `clampTarget(target, lastOffset): number`, `planMove(target, cacheWindow: CacheWindow | null, lastOffset, batchSize): MovePlan`
  - `format.ts`: `formatAmount(amount: number, currency: string): string`

- [ ] **Step 1: Package files**

`apps/playground/frontend/package.json`:

```json
{
  "name": "playground-frontend",
  "version": "1.0.0",
  "private": true,
  "description": "Replay playground UI: commands on the left, replay navigation on the right",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "tsc --noEmit -p tsconfig.json && vite build",
    "test": "node --import tsx --test 'src/**/*.test.ts'",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^24.19.2",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.7.0",
    "rimraf": "^6.1.3",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3",
    "vite": "^5.4.21"
  }
}
```

`apps/playground/frontend/tsconfig.json` (standalone; not part of the root `tsc --build`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["node", "vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/playground/frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

`apps/playground/frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EvDb Replay Playground</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run: `pnpm install`

- [ ] **Step 2: Write failing tests**

`src/replayWindow.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { clampTarget, planMove } from "./replayWindow";

describe("planMove", () => {
  const win = { start: 20, end: 39 };

  test("inside the window is served from cache", () => {
    assert.deepStrictEqual(planMove(25, win, 100, 20), { kind: "cached", target: 25 });
    assert.deepStrictEqual(planMove(20, win, 100, 20), { kind: "cached", target: 20 });
    assert.deepStrictEqual(planMove(39, win, 100, 20), { kind: "cached", target: 39 });
  });

  test("forward past the end fetches from the target", () => {
    assert.deepStrictEqual(planMove(40, win, 100, 20), { kind: "fetch", target: 40, fetchOffset: 40 });
  });

  test("backward before the start fetches a window that ends on the target", () => {
    assert.deepStrictEqual(planMove(19, win, 100, 20), { kind: "fetch", target: 19, fetchOffset: 0 });
    assert.deepStrictEqual(planMove(5, { start: 30, end: 49 }, 100, 20), {
      kind: "fetch",
      target: 5,
      fetchOffset: 0,
    });
    assert.deepStrictEqual(planMove(29, { start: 30, end: 49 }, 100, 20), {
      kind: "fetch",
      target: 29,
      fetchOffset: 10,
    });
  });

  test("no window fetches from the target", () => {
    assert.deepStrictEqual(planMove(7, null, 100, 20), { kind: "fetch", target: 7, fetchOffset: 7 });
  });

  test("targets are clamped to 0..lastOffset", () => {
    assert.deepStrictEqual(planMove(-3, win, 100, 20), { kind: "fetch", target: 0, fetchOffset: 0 });
    assert.deepStrictEqual(planMove(500, { start: 90, end: 100 }, 100, 20), { kind: "cached", target: 100 });
  });

  test("clampTarget", () => {
    assert.strictEqual(clampTarget(-1, 10), 0);
    assert.strictEqual(clampTarget(11, 10), 10);
    assert.strictEqual(clampTarget(4, 10), 4);
    assert.strictEqual(clampTarget(4, -1), 0);
  });
});
```

`src/format.test.ts`:

```ts
import { test } from "node:test";
import * as assert from "node:assert";
import { formatAmount } from "./format";

test("formatAmount rounds float noise and groups thousands", () => {
  assert.strictEqual(formatAmount(0.1 + 0.2, "USD"), "0.3 USD");
  assert.strictEqual(formatAmount(1250, "USD"), "1,250 USD");
  assert.strictEqual(formatAmount(-50.555, "EUR"), "-50.56 EUR");
  assert.strictEqual(formatAmount(0, ""), "0");
});
```

Run: `node --import tsx --test apps/playground/frontend/src/replayWindow.test.ts apps/playground/frontend/src/format.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/replayWindow.ts`:

```ts
/** Offsets held by the last replay batch, inclusive. */
export type CacheWindow = { readonly start: number; readonly end: number };

export type MovePlan =
  | { readonly kind: "cached"; readonly target: number }
  | { readonly kind: "fetch"; readonly target: number; readonly fetchOffset: number };

export function clampTarget(target: number, lastOffset: number): number {
  return Math.min(Math.max(target, 0), Math.max(lastOffset, 0));
}

/**
 * Decides whether a move can be served from the cached batch.
 * Moving back before the window fetches a batch that ends on the target,
 * so further steps back stay cached (the read-only stream cannot step backward).
 */
export function planMove(
  target: number,
  cacheWindow: CacheWindow | null,
  lastOffset: number,
  batchSize: number,
): MovePlan {
  const t = clampTarget(target, lastOffset);
  if (cacheWindow !== null && t >= cacheWindow.start && t <= cacheWindow.end) {
    return { kind: "cached", target: t };
  }
  if (cacheWindow !== null && t < cacheWindow.start) {
    return { kind: "fetch", target: t, fetchOffset: Math.max(0, t - batchSize + 1) };
  }
  return { kind: "fetch", target: t, fetchOffset: t };
}
```

`src/format.ts`:

```ts
export function formatAmount(amount: number, currency: string): string {
  const n = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return currency === "" ? n : `${n} ${currency}`;
}
```

`src/api/types.ts`:

```ts
// Mirror of the backend DTOs (apps/playground/backend/src: replay/replayBatch.ts,
// commands/commands.ts, accounts/getHead.ts). Keep in sync by hand.

export type BalanceState = { readonly amount: number; readonly currency: string };
export type StatsState = {
  readonly deposits: number;
  readonly withdrawals: number;
  readonly denied: number;
};
export type PlaygroundViews = {
  readonly balance: BalanceState;
  readonly stats: StatsState;
  readonly risk: number;
};

export type EventMeta = {
  readonly eventType: string;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly storedAt: string | null;
  readonly traceparent: string | null;
};

export type EventPayload = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
  readonly reason?: string;
};

export type MessageDto = {
  readonly messageType: string;
  readonly payload: { readonly [key: string]: string | number } | null;
};

export type ReplayItem = {
  readonly offset: number;
  readonly event_meta: EventMeta;
  readonly event_payload: EventPayload;
  readonly views: PlaygroundViews;
  readonly messages: readonly MessageDto[];
};

export type ReplayBatch = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly isHead: boolean;
  readonly items: readonly ReplayItem[];
};

export type AccountHead = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly views: PlaygroundViews;
};

export type CommandInput = {
  readonly value: number;
  readonly currency: string;
  readonly description?: string;
};

export type CommandResult = {
  readonly offset: number;
  readonly eventType: "FundsDeposited" | "FundsWithdrawn" | "WithdrawalDenied";
  readonly views: PlaygroundViews;
};
```

`src/api/client.ts`:

```ts
import type { AccountHead, CommandInput, CommandResult, ReplayBatch } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = { readonly error?: string };

// `res.json()` is untyped; the backend is our own, so its DTOs are trusted here.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) {
    const body: ErrorBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  }
  const data: T = await res.json();
  return data;
}

const enc = encodeURIComponent;

export async function listAccounts(): Promise<string[]> {
  const body = await request<{ accounts: string[] }>("/api/accounts");
  return body.accounts;
}

export const getHead = (id: string): Promise<AccountHead> => request(`/api/accounts/${enc(id)}`);

export const deposit = (id: string, input: CommandInput): Promise<CommandResult> =>
  request(`/api/accounts/${enc(id)}/deposit`, { method: "POST", body: JSON.stringify(input) });

export const withdraw = (id: string, input: CommandInput): Promise<CommandResult> =>
  request(`/api/accounts/${enc(id)}/withdraw`, { method: "POST", body: JSON.stringify(input) });

export const replay = (
  id: string,
  offset: number,
  batchSize: number,
  snapshots: boolean,
): Promise<ReplayBatch> =>
  request(
    `/api/accounts/${enc(id)}/replay?offset=${offset}&batchSize=${batchSize}&snapshots=${snapshots}`,
  );
```

- [ ] **Step 4: Run, expect pass**

Run: `node --import tsx --test apps/playground/frontend/src/replayWindow.test.ts apps/playground/frontend/src/format.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Gate + stage**

Run: `pnpm --filter playground-frontend typecheck` → no errors. Lint count `0`. Prettier: `pnpm exec prettier --write "apps/playground/**/*.{ts,tsx}"`. `git add apps/playground/frontend pnpm-lock.yaml`.

---

### Task 7: Frontend UI (hook + panes)

**Files:**
- Create: `apps/playground/frontend/src/{useReplayCursor.ts,App.tsx,CommandsPane.tsx,ReplayPane.tsx,ReplayCard.tsx,main.tsx,styles.css}`

**Interfaces:**
- Consumes: everything from Task 6.
- Produces: `BATCH_SIZE = 20`; `useReplayCursor(accountId: string | null, lastOffset: number, snapshots: boolean): ReplayCursor` where `ReplayCursor = { target; item: ReplayItem | null; cacheWindow: CacheWindow | null; fetchCount; loading; error: string | null; goTo(target: number): void }`.

- [ ] **Step 1: Hook**

`src/useReplayCursor.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replay } from "./api/client";
import type { ReplayBatch, ReplayItem } from "./api/types";
import type { CacheWindow } from "./replayWindow";
import { clampTarget, planMove } from "./replayWindow";

export const BATCH_SIZE = 20;

export type ReplayCursor = {
  readonly target: number;
  readonly item: ReplayItem | null;
  readonly cacheWindow: CacheWindow | null;
  readonly fetchCount: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly goTo: (target: number) => void;
};

/**
 * Navigation over replay batches. Moves inside the cached batch need no request;
 * moves outside it fetch a new batch (see planMove).
 */
export function useReplayCursor(
  accountId: string | null,
  lastOffset: number,
  snapshots: boolean,
): ReplayCursor {
  const [batch, setBatch] = useState<ReplayBatch | null>(null);
  const [target, setTarget] = useState(0);
  const [fetchCount, setFetchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const targetRef = useRef(0);

  const cacheWindow = useMemo<CacheWindow | null>(() => {
    if (batch === null || batch.items.length === 0) return null;
    return { start: batch.items[0].offset, end: batch.items[batch.items.length - 1].offset };
  }, [batch]);

  const moveTo = useCallback((to: number) => {
    targetRef.current = to;
    setTarget(to);
  }, []);

  const load = useCallback(
    async (to: number, fetchOffset: number) => {
      if (accountId === null) return;
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const next = await replay(accountId, fetchOffset, BATCH_SIZE, snapshots);
        if (id !== requestId.current) return; // a newer request won
        setBatch(next);
        setFetchCount((c) => c + 1);
        moveTo(to);
      } catch (e) {
        if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [accountId, snapshots, moveTo],
  );

  // A new account starts at offset 0 with a fresh fetch counter.
  useEffect(() => {
    moveTo(0);
    setFetchCount(0);
  }, [accountId, moveTo]);

  // Account, snapshot mode or head offset changed: drop the cache and reload at the target.
  useEffect(() => {
    setBatch(null);
    if (accountId === null || lastOffset < 0) return;
    const to = clampTarget(targetRef.current, lastOffset);
    void load(to, to);
  }, [accountId, snapshots, lastOffset, load]);

  const goTo = useCallback(
    (to: number) => {
      if (lastOffset < 0) return;
      const plan = planMove(to, cacheWindow, lastOffset, BATCH_SIZE);
      if (plan.kind === "cached") moveTo(plan.target);
      else void load(plan.target, plan.fetchOffset);
    },
    [cacheWindow, lastOffset, load, moveTo],
  );

  const item = batch?.items.find((i) => i.offset === target) ?? null;
  return { target, item, cacheWindow, fetchCount, loading, error, goTo };
}
```

- [ ] **Step 2: Replay card + pane**

`src/ReplayCard.tsx`:

```tsx
import type { ReactNode } from "react";
import type { ReplayItem } from "./api/types";
import { formatAmount } from "./format";

function Section({ title, raw, children }: { title: string; raw: object; children: ReactNode }) {
  return (
    <div className="section">
      <h3>{title}</h3>
      {children}
      <details>
        <summary>raw JSON</summary>
        <pre>{JSON.stringify(raw, null, 2)}</pre>
      </details>
    </div>
  );
}

export function ReplayCard({ item }: { item: ReplayItem }) {
  const { event_meta: meta, event_payload: payload, views, messages } = item;
  return (
    <div className="card">
      <Section title="event_meta" raw={meta}>
        <p>
          <strong>{meta.eventType}</strong> · offset {item.offset} · captured {meta.capturedAt} by{" "}
          {meta.capturedBy}
        </p>
      </Section>
      <Section title="event_payload" raw={payload}>
        <p>
          {payload.description} · {formatAmount(payload.value, payload.currency)}
          {payload.reason ? ` · ${payload.reason}` : ""}
        </p>
      </Section>
      <Section title="views" raw={views}>
        <p>
          balance <strong>{formatAmount(views.balance.amount, views.balance.currency)}</strong> · risk{" "}
          <strong>{views.risk}</strong>
        </p>
        <p>
          deposits {views.stats.deposits} · withdrawals {views.stats.withdrawals} · denied{" "}
          {views.stats.denied}
        </p>
      </Section>
      <Section title="messages" raw={messages}>
        {messages.length === 0 ? (
          <p>(none)</p>
        ) : (
          <ul>
            {messages.map((m, i) => (
              <li key={i}>{m.messageType}</li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
```

`src/ReplayPane.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ReplayCard } from "./ReplayCard";
import { useReplayCursor } from "./useReplayCursor";

type Props = { readonly accountId: string | null; readonly lastOffset: number };

export function ReplayPane({ accountId, lastOffset }: Props) {
  const [snapshots, setSnapshots] = useState(true);
  const [offsetInput, setOffsetInput] = useState("0");
  const cursor = useReplayCursor(accountId, lastOffset, snapshots);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") cursor.goTo(cursor.target - 1);
      if (e.key === "ArrowRight") cursor.goTo(cursor.target + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor]);

  if (accountId === null) {
    return (
      <section className="pane">
        <h2>Replay</h2>
        <p>Select an account on the left.</p>
      </section>
    );
  }
  if (lastOffset < 0) {
    return (
      <section className="pane">
        <h2>Replay · {accountId}</h2>
        <p>No events yet.</p>
      </section>
    );
  }

  const step = (delta: number) => () => cursor.goTo(cursor.target + delta);
  return (
    <section className="pane">
      <h2>Replay · {accountId}</h2>
      <div className="row">
        <input
          type="number"
          min={0}
          max={lastOffset}
          value={offsetInput}
          onChange={(e) => setOffsetInput(e.target.value)}
        />
        <button onClick={() => cursor.goTo(Number(offsetInput))}>Go</button>
        <label>
          <input
            type="checkbox"
            checked={snapshots}
            onChange={(e) => setSnapshots(e.target.checked)}
          />{" "}
          use snapshots
        </label>
      </div>
      <div className="row">
        <button onClick={() => cursor.goTo(0)}>|◀</button>
        <button onClick={step(-10)}>◀◀ -10</button>
        <button onClick={step(-1)}>◀ -1</button>
        <button onClick={step(1)}>+1 ▶</button>
        <button onClick={step(10)}>+10 ▶▶</button>
        <button onClick={() => cursor.goTo(lastOffset)}>▶|</button>
      </div>
      <div className="row">
        <input
          type="range"
          min={0}
          max={lastOffset}
          value={cursor.target}
          onChange={(e) => cursor.goTo(Number(e.target.value))}
        />
        <span>
          {cursor.target} / {lastOffset}
        </span>
      </div>
      {cursor.error !== null && <p className="error">{cursor.error}</p>}
      {cursor.item !== null ? (
        <ReplayCard item={cursor.item} />
      ) : (
        <p>{cursor.loading ? "Loading…" : "No data"}</p>
      )}
      <p className="debug">
        cache:{" "}
        {cursor.cacheWindow === null
          ? "empty"
          : `offsets ${cursor.cacheWindow.start}–${cursor.cacheWindow.end}`}{" "}
        · fetches: {cursor.fetchCount}
        {cursor.loading ? " · loading" : ""}
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Commands pane**

`src/CommandsPane.tsx`:

```tsx
import { useState } from "react";
import { ApiError, deposit, withdraw } from "./api/client";
import type { AccountHead, CommandResult } from "./api/types";
import { formatAmount } from "./format";

const LOG_SIZE = 20;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;

type LogEntry = CommandResult & { readonly value: number };

type Props = {
  readonly accounts: readonly string[];
  readonly selected: string | null;
  readonly head: AccountHead | null;
  readonly onSelect: (id: string) => void;
  readonly onCommandDone: (id: string) => Promise<void>;
};

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) return "Concurrent write, please retry";
  return e instanceof Error ? e.message : String(e);
}

export function CommandsPane({ accounts, selected, head, onSelect, onCommandDone }: Props) {
  const [newName, setNewName] = useState("");
  const [value, setValue] = useState("100");
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = selected !== null && !accounts.includes(selected) ? [...accounts, selected] : accounts;

  function useNewAccount() {
    if (!ACCOUNT_ID.test(newName)) {
      setError("Account name: 1-64 letters, digits, '-' or '_'");
      return;
    }
    setError(null);
    setLog([]);
    onSelect(newName);
    setNewName("");
  }

  async function run(kind: "deposit" | "withdraw") {
    if (selected === null) return;
    setBusy(true);
    setError(null);
    try {
      const input = {
        value: Number(value),
        currency,
        ...(description.trim() === "" ? {} : { description: description.trim() }),
      };
      const result =
        kind === "deposit" ? await deposit(selected, input) : await withdraw(selected, input);
      setLog((prev) => [{ ...result, value: input.value }, ...prev].slice(0, LOG_SIZE));
      await onCommandDone(selected);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pane">
      <h2>Commands</h2>
      <div className="row">
        <select
          value={selected ?? ""}
          onChange={(e) => {
            setLog([]);
            onSelect(e.target.value);
          }}
        >
          <option value="" disabled>
            select account
          </option>
          {options.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input placeholder="new account" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button onClick={useNewAccount}>+ use</button>
      </div>
      {selected !== null && (
        <p>
          {head === null
            ? "No events yet."
            : `Head: offset ${head.lastOffset} · ${formatAmount(head.views.balance.amount, head.views.balance.currency)} · risk ${head.views.risk}`}
        </p>
      )}
      <div className="row">
        <label>
          Value <input type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          Currency{" "}
          <input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </label>
      </div>
      <div className="row">
        <label>
          Description <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button disabled={selected === null || busy} onClick={() => void run("deposit")}>
          Deposit
        </button>
        <button disabled={selected === null || busy} onClick={() => void run("withdraw")}>
          Withdraw
        </button>
      </div>
      {error !== null && <p className="error">{error}</p>}
      <h3>Recent results</h3>
      <ul className="log">
        {log.map((l) => (
          <li key={l.offset}>
            #{l.offset} {l.eventType} {l.value} → {formatAmount(l.views.balance.amount, l.views.balance.currency)}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: App, main, styles**

`src/App.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { ApiError, getHead, listAccounts } from "./api/client";
import type { AccountHead } from "./api/types";
import { CommandsPane } from "./CommandsPane";
import { ReplayPane } from "./ReplayPane";

export function App() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [head, setHead] = useState<AccountHead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    setAccounts(await listAccounts());
  }, []);

  const refreshHead = useCallback(async (id: string) => {
    try {
      setHead(await getHead(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setHead(null);
      else throw e;
    }
  }, []);

  useEffect(() => {
    refreshAccounts().catch((e: Error) => setError(e.message));
  }, [refreshAccounts]);

  useEffect(() => {
    setHead(null);
    if (selected !== null) refreshHead(selected).catch((e: Error) => setError(e.message));
  }, [selected, refreshHead]);

  const onCommandDone = useCallback(
    async (id: string) => {
      await Promise.all([refreshHead(id), refreshAccounts()]);
    },
    [refreshHead, refreshAccounts],
  );

  return (
    <>
      {error !== null && <p className="error banner">{error}</p>}
      <main className="split">
        <CommandsPane
          accounts={accounts}
          selected={selected}
          head={head}
          onSelect={setSelected}
          onCommandDone={onCommandDone}
        />
        <ReplayPane accountId={selected} lastOffset={head?.lastOffset ?? -1} />
      </main>
    </>
  );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/styles.css`:

```css
body { margin: 0; font-family: system-ui, sans-serif; font-size: 14px; }
.split { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }
.pane { padding: 16px; overflow: auto; }
.pane + .pane { border-left: 1px solid #ccc; background: #fafafa; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.row input[type="range"] { flex: 1; }
.card .section { border: 1px solid #ddd; border-radius: 4px; padding: 8px; margin-bottom: 8px; background: #fff; }
.card h3 { margin: 0 0 4px; font-size: 12px; color: #555; text-transform: uppercase; }
pre { background: #f3f3f3; padding: 8px; overflow: auto; }
.error { color: #b00020; }
.banner { margin: 0; padding: 8px 16px; background: #fde7ea; }
.debug { color: #777; font-size: 12px; }
.log { padding-left: 16px; }
```

- [ ] **Step 5: Build + manual run**

Run: `pnpm --filter playground-frontend build` → typecheck passes, `dist/` created.
Run: `pnpm exec eslint apps/playground` → no errors.
Manual (needs Task 9's `dev.sh`, or a backend started with `POSTGRES_CONNECTION` set): open `http://localhost:5173`, create account `alice`, deposit 3 times, step with ← / →, check the "fetches" counter only grows when leaving the cache window.

- [ ] **Step 6: Gate + stage**

Prettier `--write "apps/playground/**/*.{ts,tsx}"`, `git add apps/playground/frontend`.

---

### Task 8: Docker images

**Files:**
- Create: `.dockerignore`, `apps/playground/backend/Dockerfile`, `apps/playground/frontend/Dockerfile`, `apps/playground/frontend/nginx.conf`

**Interfaces:**
- Produces images (build context = repo root):
  - `evdb-playground-backend:local` (`--target runtime`), listens on 3000, `CMD node dist/server.js`
  - `evdb-playground-migrate:local` (`--target migrate`), runs `prisma migrate deploy` with `POSTGRES_CONNECTION`
  - `evdb-playground-frontend:local`, nginx on 8080, proxies `/api/` to `http://backend:3000`

- [ ] **Step 1: `.dockerignore` (repo root)**

```
**/node_modules
**/dist
**/*.tsbuildinfo
**/.env*
.git
.claude
docs
graphify-out
```

- [ ] **Step 2: Backend Dockerfile**

`apps/playground/backend/Dockerfile`:

```dockerfile
# Build context: repo root (workspace packages resolve from it).
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec tsc --build apps/playground/backend
RUN pnpm deploy --filter playground-backend --prod --legacy /out

# Applies the Prisma migrations of the Postgres adapter.
FROM build AS migrate
WORKDIR /repo/packages/adapters/postgres-storage-adapter
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Frontend Dockerfile + nginx**

`apps/playground/frontend/Dockerfile`:

```dockerfile
# Build context: repo root.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter playground-frontend...
RUN pnpm --filter playground-frontend build

FROM nginx:stable-alpine
COPY apps/playground/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/playground/frontend/dist /usr/share/nginx/html
EXPOSE 8080
```

`apps/playground/frontend/nginx.conf`:

```nginx
server {
  listen 8080;
  root /usr/share/nginx/html;

  location /api/ {
    proxy_pass http://backend:3000;
    proxy_set_header Host $host;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

- [ ] **Step 4: Build and smoke-test the images**

```bash
docker build -f apps/playground/backend/Dockerfile --target runtime -t evdb-playground-backend:local .
docker build -f apps/playground/backend/Dockerfile --target migrate -t evdb-playground-migrate:local .
docker build -f apps/playground/frontend/Dockerfile -t evdb-playground-frontend:local .
```

Expected: three images build. Then check the backend starts and reaches Postgres (root compose DB):

```bash
docker compose up -d postgres
docker run --rm -e POSTGRES_CONNECTION=postgres://evdb:evdbpassword@host.docker.internal:5432/evdb_test \
  -p 3999:3000 evdb-playground-backend:local &
sleep 3 && curl -fsS localhost:3999/api/health && docker stop $(docker ps -q --filter ancestor=evdb-playground-backend:local)
```

Expected: `{"status":"ok"}`. If `node dist/server.js` fails with a missing module (e.g. the generated Prisma client or `@prisma/client` runtime), fix the deploy output (add the missing runtime dependency to `playground-backend` `dependencies`, or copy the missing generated folder) — do not change `packages/*`.

- [ ] **Step 5: Stage**

`git add .dockerignore apps/playground/backend/Dockerfile apps/playground/frontend/Dockerfile apps/playground/frontend/nginx.conf`

---

### Task 9: Kubernetes manifests, scripts, docs

**Files:**
- Create: `apps/playground/k8s/{kustomization,namespace,postgres,migrate-job,backend,frontend}.yaml`
- Create: `scripts/playground/{lib.sh,deploy.sh,destroy.sh,dev.sh}`
- Create: `apps/playground/README.md`
- Modify: root `package.json` (scripts), spec §6 and §7 (migrate image, dev DB)

- [ ] **Step 1: Manifests**

`apps/playground/k8s/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: evdb-playground
resources:
  - namespace.yaml
  - postgres.yaml
  - migrate-job.yaml
  - backend.yaml
  - frontend.yaml
```

`namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: evdb-playground
```

`postgres.yaml`:

```yaml
# Local-only credentials for the Docker Desktop playground.
apiVersion: v1
kind: Secret
metadata:
  name: postgres
type: Opaque
stringData:
  POSTGRES_USER: playground
  POSTGRES_PASSWORD: playground
  POSTGRES_DB: playground
  POSTGRES_CONNECTION: postgres://playground:playground@postgres:5432/playground
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:18
          ports:
            - containerPort: 5432
          envFrom:
            - secretRef:
                name: postgres
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "playground", "-d", "playground"]
            periodSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```

`migrate-job.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
spec:
  backoffLimit: 4
  template:
    spec:
      restartPolicy: OnFailure
      initContainers:
        - name: wait-for-postgres
          image: postgres:18
          command: ["sh", "-c", "until pg_isready -h postgres -U playground; do sleep 2; done"]
      containers:
        - name: migrate
          image: evdb-playground-migrate:local
          imagePullPolicy: Never
          env:
            - name: POSTGRES_CONNECTION
              valueFrom:
                secretKeyRef:
                  name: postgres
                  key: POSTGRES_CONNECTION
```

`backend.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector:
    app: backend
  ports:
    - port: 3000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      initContainers:
        - name: wait-for-schema
          image: postgres:18
          command:
            ["sh", "-c", "until psql \"$POSTGRES_CONNECTION\" -c 'select 1 from snapshot limit 1'; do sleep 2; done"]
          env:
            - name: POSTGRES_CONNECTION
              valueFrom:
                secretKeyRef:
                  name: postgres
                  key: POSTGRES_CONNECTION
      containers:
        - name: backend
          image: evdb-playground-backend:local
          imagePullPolicy: Never
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
            - name: POSTGRES_CONNECTION
              valueFrom:
                secretKeyRef:
                  name: postgres
                  key: POSTGRES_CONNECTION
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            periodSeconds: 15
```

`frontend.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  type: LoadBalancer
  selector:
    app: frontend
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: evdb-playground-frontend:local
          imagePullPolicy: Never
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /
              port: 8080
            periodSeconds: 5
```

Run: `kubectl kustomize apps/playground/k8s > /dev/null`
Expected: no error.

- [ ] **Step 2: Scripts**

`scripts/playground/lib.sh`:

```bash
# Shared helpers for the playground scripts. Source, do not run.
PLAYGROUND_NS="evdb-playground"
PLAYGROUND_CONTEXT="docker-desktop"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

require_context() {
  local ctx
  ctx="$(kubectl config current-context 2>/dev/null || true)"
  if [[ "$ctx" != "$PLAYGROUND_CONTEXT" ]]; then
    echo "Refusing to run: kubectl context is '$ctx', expected '$PLAYGROUND_CONTEXT'." >&2
    echo "Switch with: kubectl config use-context $PLAYGROUND_CONTEXT" >&2
    exit 1
  fi
}
```

`scripts/playground/deploy.sh`:

```bash
#!/usr/bin/env bash
# Builds the playground images and deploys them to Docker Desktop Kubernetes.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_context

echo "==> Building images"
docker build -f "$ROOT/apps/playground/backend/Dockerfile" --target runtime -t evdb-playground-backend:local "$ROOT"
docker build -f "$ROOT/apps/playground/backend/Dockerfile" --target migrate -t evdb-playground-migrate:local "$ROOT"
docker build -f "$ROOT/apps/playground/frontend/Dockerfile" -t evdb-playground-frontend:local "$ROOT"

echo "==> Applying manifests"
# A Job's pod template is immutable; delete it so the migration runs again.
if kubectl get namespace "$PLAYGROUND_NS" >/dev/null 2>&1; then
  kubectl delete job migrate -n "$PLAYGROUND_NS" --ignore-not-found
fi
kubectl apply -k "$ROOT/apps/playground/k8s"

echo "==> Waiting for migration"
kubectl wait --for=condition=complete job/migrate -n "$PLAYGROUND_NS" --timeout=300s

echo "==> Rolling out"
# Same :local tag, so force new pods to pick up the rebuilt images.
kubectl rollout restart deployment/backend deployment/frontend -n "$PLAYGROUND_NS"
kubectl rollout status deployment/backend -n "$PLAYGROUND_NS" --timeout=180s
kubectl rollout status deployment/frontend -n "$PLAYGROUND_NS" --timeout=180s

echo "==> Smoke check"
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8080/api/health >/dev/null; then
    echo "Playground ready: http://localhost:8080"
    exit 0
  fi
  sleep 2
done
echo "Smoke check failed: http://localhost:8080/api/health did not answer" >&2
kubectl get pods -n "$PLAYGROUND_NS" >&2
exit 1
```

`scripts/playground/destroy.sh`:

```bash
#!/usr/bin/env bash
# Deletes the playground namespace, including the Postgres volume and all data.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_context
kubectl delete namespace "$PLAYGROUND_NS" --ignore-not-found
```

`scripts/playground/dev.sh`:

```bash
#!/usr/bin/env bash
# Runs backend (tsx watch) + Vite dev server against the root docker-compose Postgres,
# using a separate "playground" database so test tables are not touched.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"

docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U evdb >/dev/null 2>&1; do sleep 1; done
docker compose exec -T postgres psql -U evdb -d evdb_test -tc \
  "SELECT 1 FROM pg_database WHERE datname = 'playground'" | grep -q 1 \
  || docker compose exec -T postgres createdb -U evdb playground

export POSTGRES_CONNECTION="${POSTGRES_CONNECTION:-postgres://evdb:evdbpassword@localhost:5432/playground}"
pnpm --filter @eventualize/postgres-storage-adapter exec prisma migrate deploy
pnpm --parallel --filter playground-backend --filter playground-frontend run dev
```

Run: `chmod +x scripts/playground/*.sh`

Root `package.json` — add to `scripts`:

```json
    "playground:deploy": "bash scripts/playground/deploy.sh",
    "playground:destroy": "bash scripts/playground/destroy.sh",
    "playground:dev": "bash scripts/playground/dev.sh",
```

- [ ] **Step 3: Docs**

`apps/playground/README.md`:

````markdown
# Replay Playground

A local playground to check stream replay (`goToOffset` + `forward`) by hand.
Left half: send deposit / withdraw commands to an account. Right half: go to
any offset of that account and step forward or backward. Each step shows the
stored event, the view states (`balance`, `stats`, `risk`) and the recomputed
outbox messages at that offset.

## Run in Kubernetes (Docker Desktop)

Needs Docker Desktop with Kubernetes on, and the kubectl context `docker-desktop`.

```bash
pnpm playground:deploy    # build images, deploy, wait, smoke check
open http://localhost:8080
pnpm playground:destroy   # delete the namespace and all its data
```

## Run locally without Kubernetes

```bash
pnpm playground:dev       # Postgres from docker-compose, backend :3000, UI :5173
```

## What to check

- Stepping to an offset gives the same card as typing the offset and pressing Go.
- "use snapshots" on and off give the same views.
- The "fetches" counter grows only when you leave the cached range.

## API

| Method | Path |
|--------|------|
| GET | `/api/health` |
| GET | `/api/accounts` |
| GET | `/api/accounts/:id` |
| POST | `/api/accounts/:id/deposit` — `{ value, currency, description? }` |
| POST | `/api/accounts/:id/withdraw` — same body |
| GET | `/api/accounts/:id/replay?offset=N&batchSize=M&snapshots=true` |

Design: [docs/superpowers/specs/2026-10-14-replay-playground-design.md](../../docs/superpowers/specs/2026-10-14-replay-playground-design.md)
````

Spec update — in `docs/superpowers/specs/2026-10-14-replay-playground-design.md`:
- §6 table, `migrate` row: replace "Job with the backend image" with "Job with the `evdb-playground-migrate:local` image (the `migrate` target of the backend Dockerfile, which keeps the Prisma CLI)".
- §6.1 Backend bullet: add "A `migrate` target reuses the build stage to run `prisma migrate deploy`."
- §7 `playground:dev` row: "against a `playground` database in the root `docker-compose` Postgres (created and migrated by `dev.sh`)".
- §7 step 2: "`docker build` the backend, migrate and frontend images."

- [ ] **Step 4: Deploy end to end**

Run: `pnpm playground:deploy`
Expected: ends with `Playground ready: http://localhost:8080`.

Run a scripted check through the nginx proxy:

```bash
curl -fsS -XPOST localhost:8080/api/accounts/k8s-check/deposit -H 'content-type: application/json' -d '{"value":100,"currency":"USD"}'
curl -fsS -XPOST localhost:8080/api/accounts/k8s-check/withdraw -H 'content-type: application/json' -d '{"value":500,"currency":"USD"}'
curl -fsS 'localhost:8080/api/accounts/k8s-check/replay?offset=0&batchSize=5'
```

Expected: second call returns `"eventType":"WithdrawalDenied"`; replay returns 2 items, `isHead: true`.

Manual UI pass (Review Focus 2): drag the slider fast across a 50+ event account; the card must end on the slider's final offset.

Run `pnpm playground:deploy` a second time. Expected: succeeds again (migration Job re-runs, rollout restarts).

- [ ] **Step 5: Full Definition of Done**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l      # 0
pnpm exec eslint . 2>&1 | grep -c " error "     # 0
pnpm lint                                       # prettier check passes
pnpm --filter playground-frontend build
pnpm test                                        # full suite, Docker running
pnpm --filter playground-backend test            # unit + Postgres integration
pnpm --filter playground-frontend test
```

The root `pnpm test` glob `apps/**/src/**/*.test.ts` is unquoted, so `sh` expands `**` as `*`. It only reaches `apps/<app>/src/<dir>/`, not `apps/playground/<pkg>/src/...`. That is why the two package test commands are run on their own. Do not change the root glob in this plan.

All must pass. If `pnpm test` fails outside `apps/playground`, rule out environment issues (Docker, ports, `.env.test`, cross-suite interference) before touching code.

- [ ] **Step 6: Stage, then ask the user about committing**

```bash
git add apps/playground scripts/playground package.json docs/superpowers
git status
```

Do not commit. Report to the user and ask for commit approval.
