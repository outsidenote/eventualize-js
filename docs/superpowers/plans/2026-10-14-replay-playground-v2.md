# Replay Playground v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an event generator, a replay page-size control with a cache/server indicator, a two-page commands pane, a resizable split, and the "Midnight glass" UI with a timeline strip and navigation log.

**Architecture:**
- Backend: a pure planner decides each generated event from the current views and an injected random function. Each decided event goes through the same rules as manual commands. New endpoints: `generate`, `timeline`, and a richer `accounts` list.
- Frontend: small pure modules (split math, move text, bar math) under tested hooks, plus new components themed with CSS custom properties.

**Tech Stack:** TypeScript 6, Express 4, React 18, Vite 5, node:test + tsx, testcontainers Postgres, Docker Desktop Kubernetes.

**Spec:** [docs/superpowers/specs/2026-10-14-replay-playground-v2-design.md](../specs/2026-10-14-replay-playground-v2-design.md)

## Global Constraints

- pnpm only. No new runtime dependencies in either package.
- Type safety: no `any`, no `as` casts (not even `as const`). `unknown` is allowed only for HTTP bodies, queries and caught errors, and must be narrowed at once. Existing exceptions stay as they are: `client.ts` `const data: T = await res.json()`, `res.json()` in backend tests, and the test-only `InMemoryStorageAdapter` snapshot state.
- `import type` for type-only imports.
- Values are money in cents precision. Use `cents()` from `domain/money.ts` whenever you compare or round amounts.
- Limits: generate `count` 1–500; `storeEvery` 1–`count`, default 1; timeline cap 5,000 events; page size 1–200, default 20; split 25–75%, default 40%, step 2%, localStorage key `evdb-playground.split`; navigation log of 12 moves.
- Theme values (spec §3.1): Midnight dark base, accent hue 211°, radius 16px, system sans-serif font, glass cards with `backdrop-filter: blur(10px)`.
- Baseline: `pnpm build` gives 0 `error TS`, and `pnpm exec eslint .` gives 0 errors. Neither may rise. Run prettier on `apps/playground/**/*.{ts,tsx}`.
- **No `git add`, no `git commit`, no `git stash`.** The user approves commits.
- Do not touch `apps/sample-app/src/tests/integration.test.ts`, `packages/core/src/factories/EvDbStreamFactory.clone.test.ts`, or anything under `packages/`.
- Every kubectl state change must run under the `docker-desktop` context.
- Backend tests: `pnpm --filter playground-backend test`. Frontend tests: `pnpm --filter playground-frontend test`. The root `pnpm test` does not reach the playground tests.

## Review Focus

1. **Float drift in target balance.** After many decimal steps the view balance can read `699.9999999`. The final balance must equal the goal within cents, and a target withdrawal must never be denied by float noise. Tests in Tasks 1 and 2.
2. **Overshoot.** No jittered step may cross the goal, in either direction. Test in Task 1.
3. **Hostile generate bodies.** `count` as a string, 0, 501 or 2.5; an unknown pattern; `target` missing, extra, or with a bad mode; `storeEvery` above `count`. Each must give 400, never 500. Test in Task 3.
4. **Badge honesty.** A fetch dropped by the stale guard must not record a 🌐 move, and a page-size change must log ♻, with the next move being 🌐. Pure tests in Task 4; the logic is in Task 5.
5. **Arrow-key clash.** ←/→ on the focused resizer must move the split, not the replay cursor. Covered in Task 6 (stopPropagation) plus a manual check in Task 7.

---

## File Map

```
backend/src/domain/money.ts                 create  cents()
backend/src/commands/commands.ts            modify  CommandIntent, appendIntent (cents-safe), deposit/withdraw use it
backend/src/generator/planEvents.ts         create  Pattern, Target, Rng, resolveGoal, assertReachable, planStep
backend/src/generator/planEvents.test.ts    create
backend/src/generator/generate.ts           create  GenerateInput, GenerateResult, generate()
backend/src/generator/generate.test.ts      create
backend/src/errors.ts                       modify  ConflictError
backend/src/http/errorHandler.ts (+test)    modify  ConflictError → 409
backend/src/tests/InMemoryStorageAdapter.ts modify  countSnapshots()
backend/src/accounts/timeline.ts            create  getTimeline()
backend/src/accounts/summaries.ts           create  listAccountSummaries()
backend/src/http/validation.ts              modify  parseGenerateBody
backend/src/http/createApp.ts (+test)       modify  routes: generate, timeline, accounts summaries
backend/src/tests/api.integration.test.ts   modify  generate + sweep
frontend/src/api/types.ts, api/client.ts    modify  new DTOs + calls
frontend/src/layout/splitRatio.ts (+test)   create
frontend/src/replay/describeMove.ts (+test) create  Move type + text
frontend/src/replay/timelineBars.ts (+test) create
frontend/src/useReplayCursor.ts             modify  pageSize param, moves
frontend/src/useTimeline.ts                 create
frontend/src/layout/SplitLayout.tsx         create
frontend/src/ui/RiskMeter.tsx, ui/SourceBadge.tsx              create
frontend/src/commands/{AccountPicker,AccountActions,ManualCommand,Generator}.tsx   create
frontend/src/replay/{ReplayPane,ReplayCard,Timeline,NavLog}.tsx                    create (move ReplayPane/ReplayCard here)
frontend/src/App.tsx, styles.css            modify
frontend/src/CommandsPane.tsx, src/ReplayPane.tsx, src/ReplayCard.tsx              delete
apps/playground/README.md                   modify
```

---

### Task 1: Money helper, shared intent path, planner

**Files:**
- Create: `apps/playground/backend/src/domain/money.ts`, `src/generator/planEvents.ts`, `src/generator/planEvents.test.ts`, `src/tests/seededRng.ts`
- Modify: `apps/playground/backend/src/commands/commands.ts`

**Interfaces:**
- Produces:
  - `cents(n: number): number`
  - `type CommandIntent = { readonly kind: "deposit" | "withdraw"; readonly value: number; readonly description: string }`
  - `appendIntent(stream: PlaygroundFundsStream, intent: CommandIntent, currency: string): Promise<PlaygroundEventType>`
  - exported `load(storage, streamId)` and `assertCurrency(stream, currency)` from commands.ts
  - `type Pattern = "random" | "riskSpike" | "riskCoolDown" | "targetBalance"`, `isPattern(v: string): v is Pattern`
  - `type Target = { readonly mode: "absolute" | "percent"; readonly value: number }`
  - `type Rng = () => number`
  - `resolveGoal(balance: number, target: Target): number`
  - `assertReachable(balance: number, goal: number, count: number): void`, which throws `ValidationError`
  - `planStep(input: { pattern: Pattern; balance: number; rng: Rng; remainingSteps: number; goal?: number }): CommandIntent`

- [ ] **Step 1: Write failing tests** — first the shared test helper `src/tests/seededRng.ts` (also used by Task 2):

```ts
import type { Rng } from "../generator/planEvents.js";

/** Deterministic LCG in [0, 1) for reproducible generator tests. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
```

Then `src/generator/planEvents.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { assertReachable, isPattern, planStep, resolveGoal } from "./planEvents.js";
import { cents } from "../domain/money.js";
import { ValidationError } from "../errors.js";
import { seededRng } from "../tests/seededRng.js";

const inRange = (v: number, min: number, max: number) => v >= min && v <= max;

describe("planStep", () => {
  test("random: both kinds, values in the small or large band", () => {
    const rng = seededRng(1);
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const s = planStep({ pattern: "random", balance: 500, rng, remainingSteps: 300 - i });
      kinds.add(s.kind);
      assert.ok(inRange(s.value, 20, 1500) || inRange(s.value, 10_000, 40_000), String(s.value));
      assert.strictEqual(s.description, "random");
    }
    assert.deepStrictEqual([...kinds].sort(), ["deposit", "withdraw"]);
  });

  test("riskSpike: large deposits only", () => {
    const rng = seededRng(2);
    for (let i = 0; i < 50; i++) {
      const s = planStep({ pattern: "riskSpike", balance: 0, rng, remainingSteps: 1 });
      assert.strictEqual(s.kind, "deposit");
      assert.ok(inRange(s.value, 10_000, 40_000));
      assert.strictEqual(s.description, "risk spike");
    }
  });

  test("riskCoolDown: small deposits only", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      const s = planStep({ pattern: "riskCoolDown", balance: 0, rng, remainingSteps: 1 });
      assert.strictEqual(s.kind, "deposit");
      assert.ok(inRange(s.value, 10, 200));
      assert.strictEqual(s.description, "risk cool-down");
    }
  });

  for (const [from, goal] of [
    [1000, 5000],
    [1000, 700],
    [0.3, 0.1],
    [123.45, 9999.99],
  ]) {
    test(`targetBalance ${from} → ${goal}: exact end, no overshoot, every step ≥ 0.01`, () => {
      const rng = seededRng(4);
      let balance = from;
      const count = 10;
      for (let i = 0; i < count; i++) {
        const s = planStep({ pattern: "targetBalance", balance, rng, remainingSteps: count - i, goal });
        assert.strictEqual(s.kind, goal > from ? "deposit" : "withdraw");
        assert.ok(s.value >= 0.01);
        balance = cents(balance + (s.kind === "deposit" ? s.value : -s.value));
        if (i < count - 1) {
          assert.ok(goal > from ? balance < goal : balance > goal, `overshoot at step ${i}`);
        }
      }
      assert.strictEqual(balance, goal);
    });
  }
});

describe("goal", () => {
  test("resolveGoal absolute and percent", () => {
    assert.strictEqual(resolveGoal(1000, { mode: "absolute", value: 5000 }), 5000);
    assert.strictEqual(resolveGoal(1000, { mode: "percent", value: -30 }), 700);
    assert.strictEqual(resolveGoal(1000, { mode: "percent", value: 25 }), 1250);
    assert.strictEqual(resolveGoal(0.3, { mode: "percent", value: -33.333 }), 0.2);
  });

  test("assertReachable rejects goal < 0, goal = balance, too-small steps", () => {
    const bad = (b: number, g: number, c: number) =>
      assert.throws(() => assertReachable(b, g, c), (e) => e instanceof ValidationError);
    bad(100, -1, 1);
    bad(100, 100, 1);
    bad(1000, 1000.05, 10);
    assert.doesNotThrow(() => assertReachable(1000, 1000.1, 10));
  });

  test("isPattern", () => {
    assert.ok(isPattern("random") && isPattern("targetBalance"));
    assert.ok(!isPattern("drain") && !isPattern(""));
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --import tsx --test apps/playground/backend/src/generator/planEvents.test.ts`
Expected: FAIL, `Cannot find module './planEvents.js'`.

- [ ] **Step 3: Implement**

`src/domain/money.ts`:

```ts
/** Rounds to cents. Use for every money comparison: view balances accumulate float noise. */
export function cents(n: number): number {
  return Math.round(n * 100) / 100;
}
```

`src/commands/commands.ts`: add the intent path and use it in `deposit`/`withdraw`. Replace the body of the file from `async function load` to the end with:

```ts
export type CommandIntent = {
  readonly kind: "deposit" | "withdraw";
  readonly value: number;
  readonly description: string;
};

export async function load(
  storage: PlaygroundStorage,
  streamId: string,
): Promise<PlaygroundFundsStream> {
  return PlaygroundFundsStreamFactory.get(streamId, storage, storage);
}

/** The account currency is fixed by the first deposit. */
export function assertCurrency(stream: PlaygroundFundsStream, currency: string): void {
  const accountCurrency = stream.views.balance.currency;
  if (accountCurrency !== "" && accountCurrency !== currency) {
    throw new ValidationError(`account currency is ${accountCurrency}, got ${currency}`);
  }
}

/**
 * Appends the event the intent decides: a deposit always succeeds; a withdraw becomes
 * FundsWithdrawn when the balance (in cents) covers it, otherwise WithdrawalDenied.
 */
export async function appendIntent(
  stream: PlaygroundFundsStream,
  intent: CommandIntent,
  currency: string,
): Promise<PlaygroundEventType> {
  const payload = { description: intent.description, value: intent.value, currency };
  if (intent.kind === "deposit") {
    await stream.appendEventFundsDeposited(payload);
    return "FundsDeposited";
  }
  if (cents(stream.views.balance.amount) >= intent.value) {
    await stream.appendEventFundsWithdrawn(payload);
    return "FundsWithdrawn";
  }
  await stream.appendEventWithdrawalDenied({ ...payload, reason: INSUFFICIENT_FUNDS });
  return "WithdrawalDenied";
}

function toResult(stream: PlaygroundFundsStream, eventType: PlaygroundEventType): CommandResult {
  return { offset: stream.storedOffset, eventType, views: copyViews(stream.views) };
}

async function runCommand(
  storage: PlaygroundStorage,
  streamId: string,
  input: CommandInput,
  kind: CommandIntent["kind"],
): Promise<CommandResult> {
  const stream = await load(storage, streamId);
  assertCurrency(stream, input.currency);
  const description = input.description ?? (kind === "deposit" ? "deposit" : "withdrawal");
  const eventType = await appendIntent(stream, { kind, value: input.value, description }, input.currency);
  await stream.store();
  return toResult(stream, eventType);
}

export const deposit = (storage: PlaygroundStorage, streamId: string, input: CommandInput) =>
  runCommand(storage, streamId, input, "deposit");

/** Appends FundsWithdrawn when the balance covers `value`, otherwise WithdrawalDenied. */
export const withdraw = (storage: PlaygroundStorage, streamId: string, input: CommandInput) =>
  runCommand(storage, streamId, input, "withdraw");
```

Add `import { cents } from "../domain/money.js";` at the top. Keep the existing `CommandInput`, `PlaygroundEventType`, `CommandResult` and `INSUFFICIENT_FUNDS` declarations.

`src/generator/planEvents.ts`:

```ts
import type { CommandIntent } from "../commands/commands.js";
import { cents } from "../domain/money.js";
import { ValidationError } from "../errors.js";

export type Pattern = "random" | "riskSpike" | "riskCoolDown" | "targetBalance";
export type Target = { readonly mode: "absolute" | "percent"; readonly value: number };
/** Returns a number in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

const MIN_STEP = 0.01;
const JITTER = 0.3;

export function isPattern(v: string): v is Pattern {
  return v === "random" || v === "riskSpike" || v === "riskCoolDown" || v === "targetBalance";
}

const between = (rng: Rng, min: number, max: number): number => cents(min + rng() * (max - min));

export function resolveGoal(balance: number, target: Target): number {
  return cents(target.mode === "absolute" ? target.value : balance * (1 + target.value / 100));
}

export function assertReachable(balance: number, goal: number, count: number): void {
  const gap = cents(goal - cents(balance));
  if (goal < 0) throw new ValidationError(`target balance ${goal} is below 0`);
  if (gap === 0) throw new ValidationError(`balance is already ${goal}`);
  if (Math.abs(gap) / count < MIN_STEP) {
    throw new ValidationError(`gap ${gap} is too small for ${count} steps (min ${MIN_STEP} each)`);
  }
}

/**
 * One target-balance step: an even share of the remaining gap with ±30% jitter, clamped so
 * every later step still gets at least MIN_STEP and the gap never changes sign. The last
 * step is the exact remaining gap.
 */
function targetStep(balance: number, goal: number, rng: Rng, remainingSteps: number): CommandIntent {
  const gap = cents(goal - cents(balance));
  const kind = gap > 0 ? "deposit" : "withdraw";
  const abs = Math.abs(gap);
  let value = abs;
  if (remainingSteps > 1) {
    const share = (abs / remainingSteps) * (1 + (rng() * 2 - 1) * JITTER);
    const max = cents(abs - MIN_STEP * (remainingSteps - 1));
    value = Math.min(max, Math.max(MIN_STEP, cents(share)));
  }
  return { kind, value, description: "target balance" };
}

export function planStep(input: {
  readonly pattern: Pattern;
  readonly balance: number;
  readonly rng: Rng;
  readonly remainingSteps: number;
  readonly goal?: number;
}): CommandIntent {
  const { pattern, balance, rng, remainingSteps, goal } = input;
  switch (pattern) {
    case "riskSpike":
      return { kind: "deposit", value: between(rng, 10_000, 40_000), description: "risk spike" };
    case "riskCoolDown":
      return { kind: "deposit", value: between(rng, 10, 200), description: "risk cool-down" };
    case "targetBalance":
      if (goal === undefined) throw new ValidationError("target is required for targetBalance");
      return targetStep(balance, goal, rng, remainingSteps);
    case "random": {
      const kind = rng() < 0.5 ? "deposit" : "withdraw";
      const value = rng() < 0.1 ? between(rng, 10_000, 40_000) : between(rng, 20, 1500);
      return { kind, value, description: "random" };
    }
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `node --import tsx --test apps/playground/backend/src/generator/planEvents.test.ts apps/playground/backend/src/commands/commands.test.ts`
Expected: all pass. The existing 6 command tests stay green.

- [ ] **Step 5: Gates.** `pnpm build 2>&1 | grep "error TS" | wc -l` → 0, `pnpm exec eslint . 2>&1 | grep -c " error "` → 0, then `pnpm exec prettier --write "apps/playground/**/*.{ts,tsx}"`. Do not stage or commit.

---

### Task 2: Generate execution

**Files:**
- Create: `apps/playground/backend/src/generator/generate.ts`, `src/generator/generate.test.ts`
- Modify: `src/errors.ts`, `src/http/errorHandler.ts`, `src/http/errorHandler.test.ts`, `src/tests/InMemoryStorageAdapter.ts`

**Interfaces:**
- Consumes (Task 1): `load`, `assertCurrency`, `appendIntent`, `planStep`, `resolveGoal`, `assertReachable`, `Pattern`, `Target`, `Rng`, `cents`.
- Produces:
  - `class ConflictError extends Error`, mapped to 409.
  - `type GenerateInput = { readonly count: number; readonly pattern: Pattern; readonly currency?: string; readonly target?: Target; readonly storeEvery: number }`
  - `type GenerateResult = { readonly fromOffset: number; readonly toOffset: number; readonly count: number; readonly denied: number; readonly views: PlaygroundViews }`
  - `generate(storage: PlaygroundStorage, streamId: string, input: GenerateInput, rng?: Rng): Promise<GenerateResult>`
  - `InMemoryStorageAdapter.countSnapshots(streamType: string, streamId: string, viewName: string): number`

- [ ] **Step 1: Test-adapter helper.** In `src/tests/InMemoryStorageAdapter.ts`, add this public method. It reuses the same key format as `storeSnapshotAsync`:

```ts
  /** Number of stored snapshot rows for one view (test assertion helper). */
  countSnapshots(streamType: string, streamId: string, viewName: string): number {
    return (this.snapshots.get(`${streamType}/${streamId}/${viewName}`) ?? []).length;
  }
```

- [ ] **Step 2: Write failing tests**

`src/generator/generate.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { generate } from "./generate.js";
import { seededRng } from "../tests/seededRng.js";
import { deposit } from "../commands/commands.js";
import { cents } from "../domain/money.js";
import { ValidationError } from "../errors.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

const base = { storeEvery: 1 };

describe("generate", () => {
  test("riskSpike then riskCoolDown move risk to 10 then 0", async () => {
    const s = new InMemoryStorageAdapter();
    const spike = await generate(s, "a", { ...base, count: 5, pattern: "riskSpike" }, seededRng(1));
    assert.strictEqual(spike.views.risk, 10);
    const cool = await generate(s, "a", { ...base, count: 20, pattern: "riskCoolDown" }, seededRng(2));
    assert.strictEqual(cool.views.risk, 0);
    assert.deepStrictEqual([spike.fromOffset, spike.toOffset, cool.fromOffset, cool.toOffset], [0, 4, 5, 24]);
  });

  test("random produces some WithdrawalDenied and reports them", async () => {
    const s = new InMemoryStorageAdapter();
    const r = await generate(s, "b", { ...base, count: 200, pattern: "random" }, seededRng(3));
    assert.ok(r.denied > 0);
    assert.strictEqual(r.views.stats.denied, r.denied);
    assert.strictEqual(r.count, 200);
  });

  test("targetBalance absolute up and percent down end exactly, with no denials", async () => {
    const s = new InMemoryStorageAdapter();
    await deposit(s, "c", { value: 1000, currency: "USD" });
    const up = await generate(
      s, "c", { ...base, count: 10, pattern: "targetBalance", target: { mode: "absolute", value: 5000 } }, seededRng(4),
    );
    assert.strictEqual(cents(up.views.balance.amount), 5000);
    assert.strictEqual(up.denied, 0);
    const down = await generate(
      s, "c", { ...base, count: 37, pattern: "targetBalance", target: { mode: "percent", value: -30 } }, seededRng(5),
    );
    assert.strictEqual(cents(down.views.balance.amount), 3500);
    assert.strictEqual(down.denied, 0);
  });

  test("storeEvery K writes ceil(count / K) snapshots per view", async () => {
    const s = new InMemoryStorageAdapter();
    await generate(s, "d", { count: 10, storeEvery: 3, pattern: "riskCoolDown" }, seededRng(6));
    for (const view of ["balance", "stats", "risk"]) {
      assert.strictEqual(s.countSnapshots("playground-funds", "d", view), 4, view);
    }
  });

  test("currency: defaults to the account currency, rejects a mismatch", async () => {
    const s = new InMemoryStorageAdapter();
    await deposit(s, "e", { value: 10, currency: "EUR" });
    const r = await generate(s, "e", { ...base, count: 2, pattern: "riskCoolDown" }, seededRng(7));
    assert.strictEqual(r.views.balance.currency, "EUR");
    await assert.rejects(
      generate(s, "e", { ...base, count: 1, pattern: "riskCoolDown", currency: "USD" }, seededRng(8)),
      (err) => err instanceof ValidationError,
    );
  });

  test("a new account defaults to USD", async () => {
    const s = new InMemoryStorageAdapter();
    const r = await generate(s, "f", { ...base, count: 1, pattern: "riskSpike" }, seededRng(9));
    assert.strictEqual(r.views.balance.currency, "USD");
  });

  test("unreachable targets are rejected before anything is stored", async () => {
    const s = new InMemoryStorageAdapter();
    await deposit(s, "g", { value: 1000, currency: "USD" });
    for (const target of [
      { mode: "absolute", value: -5 },
      { mode: "absolute", value: 1000 },
      { mode: "absolute", value: 1000.05 },
    ] satisfies Array<{ mode: "absolute"; value: number }>) {
      await assert.rejects(
        generate(s, "g", { ...base, count: 10, pattern: "targetBalance", target }, seededRng(10)),
        (err) => err instanceof ValidationError,
      );
    }
    const next = await deposit(s, "g", { value: 1, currency: "USD" });
    assert.strictEqual(next.offset, 1);
  });
});
```

Notes on these tests:
- The percent-down expectation is 3500, which is 5000 × 0.7.

Add to `src/http/errorHandler.test.ts`: `statusFor(new ConflictError("x")) === 409`.

- [ ] **Step 3: Run, expect failure**

Run: `node --import tsx --test apps/playground/backend/src/generator/generate.test.ts`
Expected: FAIL, `Cannot find module './generate.js'`.

- [ ] **Step 4: Implement**

`src/errors.ts`, append:

```ts
/** Concurrent write. Maps to HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
```

`src/http/errorHandler.ts`: in `statusFor`, return 409 for `err instanceof ConflictError`, next to the existing OCC branch. Import it with the other errors.

`src/generator/generate.ts`:

```ts
import OCCException from "@eventualize/types/primitives/OCCException";
import { appendIntent, assertCurrency, load } from "../commands/commands.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { ConflictError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";
import { assertReachable, planStep, resolveGoal } from "./planEvents.js";
import type { Pattern, Rng, Target } from "./planEvents.js";

const DEFAULT_CURRENCY = "USD";

export type GenerateInput = {
  readonly count: number;
  readonly pattern: Pattern;
  readonly currency?: string;
  readonly target?: Target;
  readonly storeEvery: number;
};

export type GenerateResult = {
  readonly fromOffset: number;
  readonly toOffset: number;
  readonly count: number;
  readonly denied: number;
  readonly views: PlaygroundViews;
};

const isConflict = (err: unknown): boolean =>
  err instanceof OCCException || (err instanceof Error && err.name === "OCCException");

/**
 * Appends `count` planned events to one stream, calling store() after every `storeEvery`
 * events and at the end. Each store() writes one snapshot per view.
 */
export async function generate(
  storage: PlaygroundStorage,
  streamId: string,
  input: GenerateInput,
  rng: Rng = Math.random,
): Promise<GenerateResult> {
  const stream = await load(storage, streamId);
  const currency = input.currency ?? (stream.views.balance.currency || DEFAULT_CURRENCY);
  assertCurrency(stream, currency);

  let goal: number | undefined;
  if (input.pattern === "targetBalance" && input.target !== undefined) {
    goal = resolveGoal(stream.views.balance.amount, input.target);
    assertReachable(stream.views.balance.amount, goal, input.count);
  }

  let denied = 0;
  let stored = 0;
  let pending = 0;
  try {
    for (let i = 0; i < input.count; i++) {
      const intent = planStep({
        pattern: input.pattern,
        balance: stream.views.balance.amount,
        rng,
        remainingSteps: input.count - i,
        goal,
      });
      if ((await appendIntent(stream, intent, currency)) === "WithdrawalDenied") denied++;
      pending++;
      if (pending === input.storeEvery || i === input.count - 1) {
        await stream.store();
        stored += pending;
        pending = 0;
      }
    }
  } catch (err) {
    if (isConflict(err)) {
      throw new ConflictError(
        `concurrent write: stored ${stored} of ${input.count} generated events`,
      );
    }
    throw err;
  }

  const toOffset = stream.storedOffset;
  return {
    fromOffset: toOffset - input.count + 1,
    toOffset,
    count: input.count,
    denied,
    views: copyViews(stream.views),
  };
}
```

- [ ] **Step 5: Run, expect pass**

Run: `pnpm --filter playground-backend test`
Expected: all unit tests pass, including the new ones. The Postgres integration test also runs, so Docker must be up.

- [ ] **Step 6: Gates** (same as Task 1). Do not stage or commit.

---

### Task 3: HTTP — generate, timeline, account summaries

**Files:**
- Create: `apps/playground/backend/src/accounts/timeline.ts`, `src/accounts/summaries.ts`
- Modify: `src/http/validation.ts`, `src/http/createApp.ts`, `src/http/createApp.test.ts`, `src/tests/api.integration.test.ts`

**Interfaces:**
- Consumes: `generate`, `GenerateInput` (Task 2); `getHead` (existing); `isPattern`, `Target` (Task 1).
- Produces:
  - `MAX_GENERATE_COUNT = 500`; `parseGenerateBody(body: unknown): GenerateInput`
  - `TIMELINE_LIMIT = 5000`; `type TimelineEntry = { readonly offset: number; readonly eventType: string; readonly value: number }`; `type Timeline = { readonly lastOffset: number; readonly events: TimelineEntry[] }`; `getTimeline(storage, streamId): Promise<Timeline>`
  - `type AccountSummary = { readonly id: string; readonly lastOffset: number; readonly balance: BalanceState; readonly risk: number }`; `listAccountSummaries(storage, listAccounts): Promise<AccountSummary[]>`
  - Routes:
    - `POST /api/accounts/:id/generate` → `GenerateResult`
    - `GET /api/accounts/:id/timeline` → `Timeline`
    - `GET /api/accounts` → `{ accounts: AccountSummary[] }`

- [ ] **Step 1: Write failing HTTP tests.** In `src/http/createApp.test.ts`:

(a) Replace the test `"GET /api/accounts uses listAccounts"` with:

```ts
  test("GET /api/accounts returns summaries for known ids and skips unknown ones", async () => {
    await post("/api/accounts/alice/deposit", JSON.stringify({ value: 7, currency: "USD" }));
    const res = await fetch(`${base}/api/accounts`);
    const body = await res.json();
    assert.strictEqual(body.accounts.length, 1);
    const [a] = body.accounts;
    assert.strictEqual(a.id, "alice");
    assert.strictEqual(typeof a.lastOffset, "number");
    assert.strictEqual(a.balance.currency, "USD");
    assert.strictEqual(typeof a.risk, "number");
  });
```

Change the app setup in `before` to `listAccounts: async () => ["alice", "ghost"]`. `ghost` has no events and must be skipped. Then update the round-trip test's offset expectations: it now runs after one extra alice deposit, so the expected head `lastOffset` and replay item count each go up by one. Read the test and adjust the numbers exactly.

(b) Add:

```ts
  test("POST generate appends events and returns the range", async () => {
    const res = await post(
      "/api/accounts/gen1/generate",
      JSON.stringify({ count: 12, pattern: "riskSpike", storeEvery: 5 }),
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual([body.fromOffset, body.toOffset, body.count], [0, 11, 12]);
    assert.strictEqual(body.views.risk, 10);
  });

  test("400 on hostile generate bodies", async () => {
    const bodies = [
      { count: "5", pattern: "random" },
      { count: 0, pattern: "random" },
      { count: 501, pattern: "random" },
      { count: 2.5, pattern: "random" },
      { count: 5, pattern: "drain" },
      { count: 5 },
      { count: 5, pattern: "targetBalance" },
      { count: 5, pattern: "targetBalance", target: { mode: "ratio", value: 1 } },
      { count: 5, pattern: "targetBalance", target: { mode: "absolute", value: "9" } },
      { count: 5, pattern: "random", target: { mode: "absolute", value: 9 } },
      { count: 5, pattern: "random", storeEvery: 6 },
      { count: 5, pattern: "random", storeEvery: 0 },
      { count: 5, pattern: "random", currency: "usd" },
    ];
    for (const b of bodies) {
      const res = await post("/api/accounts/gen2/generate", JSON.stringify(b));
      assert.strictEqual(res.status, 400, JSON.stringify(b));
    }
  });

  test("GET timeline returns raw events; 404 for unknown", async () => {
    await post("/api/accounts/tl/generate", JSON.stringify({ count: 3, pattern: "riskCoolDown" }));
    const res = await fetch(`${base}/api/accounts/tl/timeline`);
    const body = await res.json();
    assert.strictEqual(body.lastOffset, 2);
    assert.deepStrictEqual(
      body.events.map((e: { offset: number; eventType: string }) => [e.offset, e.eventType]),
      [[0, "FundsDeposited"], [1, "FundsDeposited"], [2, "FundsDeposited"]],
    );
    assert.ok(body.events.every((e: { value: number }) => typeof e.value === "number"));
    assert.strictEqual((await fetch(`${base}/api/accounts/nobody/timeline`)).status, 404);
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `node --import tsx --test apps/playground/backend/src/http/createApp.test.ts`
Expected: the new tests fail with 404s or shape mismatches.

- [ ] **Step 3: Implement**

`src/accounts/timeline.ts`:

```ts
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { STREAM_TYPE } from "../domain/streamType.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export const TIMELINE_LIMIT = 5000;

export type TimelineEntry = {
  readonly offset: number;
  readonly eventType: string;
  readonly value: number;
};

export type Timeline = { readonly lastOffset: number; readonly events: TimelineEntry[] };

/** Raw event summaries (no views) for the last TIMELINE_LIMIT events. */
export async function getTimeline(storage: PlaygroundStorage, streamId: string): Promise<Timeline> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  const from = Math.max(0, lastOffset - (TIMELINE_LIMIT - 1));
  const events: TimelineEntry[] = [];
  for await (const e of storage.getEventsAsync(new EvDbStreamCursor(STREAM_TYPE, streamId, from))) {
    const offset = e.streamCursor.offset;
    if (offset > lastOffset) break;
    const value = e.payload.value;
    events.push({ offset, eventType: e.eventType, value: typeof value === "number" ? value : 0 });
  }
  return { lastOffset, events };
}
```

`src/accounts/summaries.ts`:

```ts
import type { BalanceState } from "../domain/views.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";
import { getHead } from "./getHead.js";

export type AccountSummary = {
  readonly id: string;
  readonly lastOffset: number;
  readonly balance: BalanceState;
  readonly risk: number;
};

/** Head state per account id. Ids without events (e.g. a race with deletion) are skipped. */
export async function listAccountSummaries(
  storage: PlaygroundStorage,
  listAccounts: () => Promise<string[]>,
): Promise<AccountSummary[]> {
  const ids = await listAccounts();
  const heads = await Promise.all(
    ids.map(async (id) => {
      try {
        return await getHead(storage, id);
      } catch (err) {
        if (err instanceof NotFoundError) return null;
        throw err;
      }
    }),
  );
  return heads.flatMap((h) =>
    h === null
      ? []
      : [{ id: h.streamId, lastOffset: h.lastOffset, balance: h.views.balance, risk: h.views.risk }],
  );
}
```

`src/http/validation.ts`, append. Add the imports `import type { GenerateInput } from "../generator/generate.js";`, `import { isPattern } from "../generator/planEvents.js";` and `import type { Target } from "../generator/planEvents.js";`.

```ts
export const MAX_GENERATE_COUNT = 500;

function parseIntField(raw: unknown, name: string, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return raw;
}

function parseTarget(raw: unknown): Target {
  if (typeof raw !== "object" || raw === null) {
    throw new ValidationError("target must be { mode, value }");
  }
  const mode = "mode" in raw ? raw.mode : undefined;
  const value = "value" in raw ? raw.value : undefined;
  if (mode !== "absolute" && mode !== "percent") {
    throw new ValidationError("target.mode must be absolute or percent");
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError("target.value must be a number");
  }
  return { mode, value };
}

export function parseGenerateBody(body: unknown): GenerateInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("body must be a JSON object");
  }
  const count = parseIntField("count" in body ? body.count : undefined, "count", 1, MAX_GENERATE_COUNT);
  const pattern = "pattern" in body ? body.pattern : undefined;
  if (typeof pattern !== "string" || !isPattern(pattern)) {
    throw new ValidationError("pattern must be random, riskSpike, riskCoolDown or targetBalance");
  }
  const rawStoreEvery = "storeEvery" in body ? body.storeEvery : undefined;
  const storeEvery =
    rawStoreEvery === undefined ? 1 : parseIntField(rawStoreEvery, "storeEvery", 1, count);
  const currency = "currency" in body ? body.currency : undefined;
  if (currency !== undefined && (typeof currency !== "string" || !CURRENCY.test(currency))) {
    throw new ValidationError("currency must be a 3-letter upper-case code");
  }
  const rawTarget = "target" in body ? body.target : undefined;
  if (pattern === "targetBalance") {
    if (rawTarget === undefined) throw new ValidationError("target is required for targetBalance");
    return { count, pattern, storeEvery, target: parseTarget(rawTarget), ...(currency ? { currency } : {}) };
  }
  if (rawTarget !== undefined) {
    throw new ValidationError("target is only allowed for targetBalance");
  }
  return { count, pattern, storeEvery, ...(currency ? { currency } : {}) };
}
```

`src/http/createApp.ts`:
- Import `generate`, `getTimeline`, `listAccountSummaries` and `parseGenerateBody`.
- Change the `/api/accounts` handler to `res.json({ accounts: await listAccountSummaries(storage, listAccounts) });`.
- Add:

```ts
  app.post(
    "/api/accounts/:id/generate",
    handle<AccountParams>(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await generate(storage, id, parseGenerateBody(req.body)));
    }),
  );

  app.get(
    "/api/accounts/:id/timeline",
    handle<AccountParams>(async (req, res) => {
      res.json(await getTimeline(storage, parseAccountId(req.params.id)));
    }),
  );
```

- [ ] **Step 4: Extend the Postgres integration test.** In `src/tests/api.integration.test.ts`:
- Generalise the existing `replay(offset, batchSize, snapshots)` helper to `replayFor(account, offset, batchSize, snapshots)`. Keep `replay(...)` as a thin wrapper for `"alice"` so the existing tests don't change.
- Update the existing accounts assertion to the new summary shape: compare `accounts.map(a => a.id)` to `["alice", "bob"]`.
- Append a new `test(...)` as the last test of the describe:

```ts
  test("generate with storeEvery 7: sparse snapshots, replay equals full fold", async () => {
    const res = await send("/api/accounts/gen/generate", { count: 60, pattern: "random", storeEvery: 7 });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual([body.fromOffset, body.toOffset], [0, 59]);
    const rows = await prisma.snapshot.count({ where: { stream_type: "playground-funds", stream_id: "gen" } });
    assert.strictEqual(rows, 3 * Math.ceil(60 / 7));
    const reference = await replayFor("gen", 0, 200, false);
    assert.strictEqual(reference.items.length, 60);
    for (const pageSize of [1, 7, 20]) {
      for (let offset = 0; offset < 60; offset++) {
        const batch = await replayFor("gen", offset, pageSize, true);
        assert.deepStrictEqual(
          batch.items.map(strip),
          reference.items.slice(offset, offset + pageSize).map(strip),
          `offset=${offset} pageSize=${pageSize}`,
        );
      }
    }
  });
```

- [ ] **Step 5: Run, expect pass**

Run: `pnpm --filter playground-backend test` (Docker up).
Expected: all pass.

- [ ] **Step 6: Gates** (as in Task 1). Do not stage or commit.

---

### Task 4: Frontend pure modules + API

**Files:**
- Create: `apps/playground/frontend/src/layout/splitRatio.ts` (+ `.test.ts`), `src/replay/describeMove.ts` (+ `.test.ts`), `src/replay/timelineBars.ts` (+ `.test.ts`)
- Modify: `src/api/types.ts`, `src/api/client.ts`, `src/replayWindow.test.ts`

**Interfaces:**
- Produces:
  - `SPLIT_MIN = 25`, `SPLIT_MAX = 75`, `SPLIT_DEFAULT = 40`, `SPLIT_STEP = 2`, `SPLIT_STORAGE_KEY = "evdb-playground.split"`; `clampRatio(r)`, `ratioFromPointer(clientX, left, width)`, `parseStoredRatio(raw: string | null)`
  - `type MoveSource = "cache" | "server"`, `type MoveReason = "nav" | "reload" | "pageSize"`, `type Move = { readonly target: number; readonly direction: -1 | 0 | 1; readonly source: MoveSource; readonly reason: MoveReason; readonly pageSize: number; readonly fetched?: CacheWindow }`; `directionOf(from, to): -1 | 0 | 1`; `describeMove(m: Move): string`
  - `type BarKind = "deposit" | "withdraw" | "denied"`; `barKind(eventType)`, `barHeight(value)`, `inWindow(offset, window)`
  - API types: `AccountSummary`, `GeneratePattern`, `GenerateTarget`, `GenerateInput`, `GenerateResult`, `TimelineEntry`, `Timeline`
  - client: `listAccounts(): Promise<AccountSummary[]>`, `generate(id, input): Promise<GenerateResult>`, `timeline(id): Promise<Timeline>`

- [ ] **Step 1: Write failing tests**

`src/layout/splitRatio.test.ts`:

```ts
import { test } from "node:test";
import * as assert from "node:assert";
import { clampRatio, parseStoredRatio, ratioFromPointer, SPLIT_DEFAULT } from "./splitRatio";

test("clampRatio", () => {
  assert.strictEqual(clampRatio(10), 25);
  assert.strictEqual(clampRatio(90), 75);
  assert.strictEqual(clampRatio(40.04), 40);
  assert.strictEqual(clampRatio(Number.NaN), SPLIT_DEFAULT);
});

test("ratioFromPointer", () => {
  assert.strictEqual(ratioFromPointer(500, 100, 1000), 40);
  assert.strictEqual(ratioFromPointer(0, 100, 1000), 25);
  assert.strictEqual(ratioFromPointer(500, 0, 0), SPLIT_DEFAULT);
});

test("parseStoredRatio", () => {
  assert.strictEqual(parseStoredRatio(null), SPLIT_DEFAULT);
  assert.strictEqual(parseStoredRatio("abc"), SPLIT_DEFAULT);
  assert.strictEqual(parseStoredRatio("55"), 55);
  assert.strictEqual(parseStoredRatio("99"), 75);
});
```

`src/replay/describeMove.test.ts`:

```ts
import { test } from "node:test";
import * as assert from "node:assert";
import { describeMove, directionOf } from "./describeMove";

test("describeMove covers every reason and source", () => {
  assert.strictEqual(
    describeMove({ target: 17, direction: 1, source: "cache", reason: "nav", pageSize: 20 }),
    "⚡ → 17 from cache",
  );
  assert.strictEqual(
    describeMove({ target: 40, direction: 1, source: "server", reason: "nav", pageSize: 20, fetched: { start: 40, end: 59 } }),
    "🌐 → 40 fetched 40–59",
  );
  assert.strictEqual(
    describeMove({ target: 3, direction: 0, source: "server", reason: "reload", pageSize: 20, fetched: { start: 3, end: 9 } }),
    "↻ 🌐 → 3 fetched 3–9",
  );
  assert.strictEqual(
    describeMove({ target: 5, direction: 0, source: "server", reason: "pageSize", pageSize: 50, fetched: { start: 5, end: 54 } }),
    "♻ page size → 50 · 🌐 → 5 fetched 5–54",
  );
});

test("directionOf", () => {
  assert.strictEqual(directionOf(3, 9), 1);
  assert.strictEqual(directionOf(9, 3), -1);
  assert.strictEqual(directionOf(4, 4), 0);
});
```

`src/replay/timelineBars.test.ts`:

```ts
import { test } from "node:test";
import * as assert from "node:assert";
import { barHeight, barKind, inWindow } from "./timelineBars";

test("barKind", () => {
  assert.strictEqual(barKind("FundsDeposited"), "deposit");
  assert.strictEqual(barKind("FundsWithdrawn"), "withdraw");
  assert.strictEqual(barKind("WithdrawalDenied"), "denied");
});

test("barHeight grows with log10(value), 15..100", () => {
  assert.strictEqual(barHeight(0), 15);
  assert.strictEqual(barHeight(1), 15);
  assert.strictEqual(barHeight(10), 32);
  assert.strictEqual(barHeight(10_000), 83);
  assert.strictEqual(barHeight(1e9), 100);
  assert.ok(barHeight(500) > barHeight(50));
});

test("inWindow", () => {
  assert.ok(inWindow(5, { start: 5, end: 9 }));
  assert.ok(!inWindow(10, { start: 5, end: 9 }));
  assert.ok(!inWindow(5, null));
});
```

Add to `src/replayWindow.test.ts`:

```ts
test("planMove with page sizes 1, 7 and 200", () => {
  assert.deepStrictEqual(planMove(9, { start: 10, end: 10 }, 100, 1), { kind: "fetch", target: 9, fetchOffset: 9 });
  assert.deepStrictEqual(planMove(13, { start: 14, end: 20 }, 100, 7), { kind: "fetch", target: 13, fetchOffset: 7 });
  assert.deepStrictEqual(planMove(150, { start: 0, end: 199 }, 300, 200), { kind: "cached", target: 150 });
  assert.deepStrictEqual(planMove(250, { start: 0, end: 199 }, 300, 200), { kind: "fetch", target: 250, fetchOffset: 250 });
});
```

Run: `pnpm --filter playground-frontend test`. Expected: FAIL, modules not found.

- [ ] **Step 2: Implement**

`src/layout/splitRatio.ts`:

```ts
export const SPLIT_MIN = 25;
export const SPLIT_MAX = 75;
export const SPLIT_DEFAULT = 40;
export const SPLIT_STEP = 2;
export const SPLIT_STORAGE_KEY = "evdb-playground.split";

/** Left-pane width in percent, clamped to SPLIT_MIN..SPLIT_MAX, one decimal. */
export function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(r * 10) / 10));
}

export function ratioFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return SPLIT_DEFAULT;
  return clampRatio(((clientX - left) / width) * 100);
}

export function parseStoredRatio(raw: string | null): number {
  if (raw === null) return SPLIT_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) ? clampRatio(n) : SPLIT_DEFAULT;
}
```

Note: `Number("")` is 0, which clamps to 25. That is acceptable.

`src/replay/describeMove.ts`:

```ts
import type { CacheWindow } from "../replayWindow";

export type MoveSource = "cache" | "server";
export type MoveReason = "nav" | "reload" | "pageSize";

/** One completed navigation, for the source badge, the slide direction and the log. */
export type Move = {
  readonly target: number;
  readonly direction: -1 | 0 | 1;
  readonly source: MoveSource;
  readonly reason: MoveReason;
  readonly pageSize: number;
  readonly fetched?: CacheWindow;
};

export function directionOf(from: number, to: number): -1 | 0 | 1 {
  return to > from ? 1 : to < from ? -1 : 0;
}

export function describeMove(m: Move): string {
  const prefix =
    m.reason === "pageSize" ? `♻ page size → ${m.pageSize} · ` : m.reason === "reload" ? "↻ " : "";
  if (m.source === "cache") return `${prefix}⚡ → ${m.target} from cache`;
  const range = m.fetched ? ` fetched ${m.fetched.start}–${m.fetched.end}` : "";
  return `${prefix}🌐 → ${m.target}${range}`;
}
```

`src/replay/timelineBars.ts`:

```ts
import type { CacheWindow } from "../replayWindow";

export type BarKind = "deposit" | "withdraw" | "denied";

export function barKind(eventType: string): BarKind {
  if (eventType === "FundsDeposited") return "deposit";
  if (eventType === "FundsWithdrawn") return "withdraw";
  return "denied";
}

/** Bar height in percent: 15 at value ≤ 1, +17 per decade, capped at 100. */
export function barHeight(value: number): number {
  const decades = Math.log10(Math.max(1, value));
  return Math.min(100, Math.round(15 + decades * 17));
}

export function inWindow(offset: number, w: CacheWindow | null): boolean {
  return w !== null && offset >= w.start && offset <= w.end;
}
```

`src/api/types.ts`, append and update the header comment so it also lists `generator/generate.ts`, `accounts/timeline.ts` and `accounts/summaries.ts`:

```ts
export type AccountSummary = {
  readonly id: string;
  readonly lastOffset: number;
  readonly balance: BalanceState;
  readonly risk: number;
};

export type GeneratePattern = "random" | "riskSpike" | "riskCoolDown" | "targetBalance";
export type GenerateTarget = { readonly mode: "absolute" | "percent"; readonly value: number };

export type GenerateInput = {
  readonly count: number;
  readonly pattern: GeneratePattern;
  readonly storeEvery: number;
  readonly currency?: string;
  readonly target?: GenerateTarget;
};

export type GenerateResult = {
  readonly fromOffset: number;
  readonly toOffset: number;
  readonly count: number;
  readonly denied: number;
  readonly views: PlaygroundViews;
};

export type TimelineEntry = {
  readonly offset: number;
  readonly eventType: string;
  readonly value: number;
};

export type Timeline = { readonly lastOffset: number; readonly events: readonly TimelineEntry[] };
```

`src/api/client.ts`:
- Change `listAccounts` to return `Promise<AccountSummary[]>`, using `request<{ accounts: AccountSummary[] }>`.
- Add:

```ts
export const generate = (id: string, input: GenerateInput): Promise<GenerateResult> =>
  request(`/api/accounts/${enc(id)}/generate`, { method: "POST", body: JSON.stringify(input) });

export const timeline = (id: string): Promise<Timeline> =>
  request(`/api/accounts/${enc(id)}/timeline`);
```

Fix the existing callers of `listAccounts` (`App.tsx` stores `string[]`) so the build compiles. A minimal change is fine here; `App.tsx` is rewritten in Task 6. One option is a temporary `accounts.map((a) => a.id)` in `App.tsx`.

- [ ] **Step 3: Run, expect pass**

Run: `pnpm --filter playground-frontend test` and `pnpm --filter playground-frontend typecheck`.
Expected: all pass, typecheck clean.

- [ ] **Step 4: Gates** (as in Task 1). Do not stage or commit.

---

### Task 5: Hooks

**Files:**
- Modify: `apps/playground/frontend/src/useReplayCursor.ts`
- Create: `src/useTimeline.ts`

**Interfaces:**
- Consumes: `Move`, `MoveReason`, `directionOf` (Task 4), `timeline()` (Task 4).
- Produces:
  - `MOVE_LOG_SIZE = 12`
  - `useReplayCursor(accountId: string | null, lastOffset: number, snapshots: boolean, pageSize: number): ReplayCursor`, where `ReplayCursor` adds `lastMove: Move | null` and `moves: readonly Move[]` to the existing fields. The `BATCH_SIZE` export is removed.
  - `useTimeline(accountId: string | null, lastOffset: number): { readonly events: readonly TimelineEntry[]; readonly error: string | null }`

- [ ] **Step 1: Rewrite `useReplayCursor.ts`** (complete file):

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replay } from "./api/client";
import type { ReplayBatch, ReplayItem } from "./api/types";
import { directionOf } from "./replay/describeMove";
import type { Move, MoveReason } from "./replay/describeMove";
import type { CacheWindow } from "./replayWindow";
import { clampTarget, planMove } from "./replayWindow";

export const MOVE_LOG_SIZE = 12;

export type ReplayCursor = {
  readonly target: number;
  readonly item: ReplayItem | null;
  readonly cacheWindow: CacheWindow | null;
  readonly fetchCount: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastMove: Move | null;
  readonly moves: readonly Move[];
  readonly goTo: (target: number) => void;
};

/**
 * Navigation over replay batches of `pageSize` items. Moves inside the cached batch need no
 * request; moves outside it fetch a new batch (see planMove). Every completed move is
 * recorded with its source; a response dropped by the stale guard records nothing.
 */
export function useReplayCursor(
  accountId: string | null,
  lastOffset: number,
  snapshots: boolean,
  pageSize: number,
): ReplayCursor {
  const [batch, setBatch] = useState<ReplayBatch | null>(null);
  const [target, setTarget] = useState(0);
  const [fetchCount, setFetchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moves, setMoves] = useState<readonly Move[]>([]);
  const requestId = useRef(0);
  const targetRef = useRef(0);
  const prevPageSize = useRef(pageSize);

  // Defensive: never expose a batch that belongs to another account.
  const current = batch !== null && batch.streamId === accountId ? batch : null;

  const cacheWindow = useMemo<CacheWindow | null>(() => {
    const first = current?.items[0];
    const last = current?.items[current.items.length - 1];
    if (first === undefined || last === undefined) return null;
    return { start: first.offset, end: last.offset };
  }, [current]);

  const record = useCallback((m: Move) => {
    setMoves((prev) => [m, ...prev].slice(0, MOVE_LOG_SIZE));
  }, []);

  // Invalidate any in-flight request so its response is dropped.
  const cancelPending = useCallback(() => {
    requestId.current++;
    setLoading(false);
  }, []);

  const moveTo = useCallback((to: number) => {
    targetRef.current = to;
    setTarget(to);
  }, []);

  const load = useCallback(
    async (to: number, fetchOffset: number, reason: MoveReason) => {
      if (accountId === null) return;
      const id = ++requestId.current;
      const from = targetRef.current;
      setLoading(true);
      setError(null);
      try {
        const next = await replay(accountId, fetchOffset, pageSize, snapshots);
        if (id !== requestId.current) return; // a newer request won: record nothing
        setBatch(next);
        setFetchCount((c) => c + 1);
        moveTo(to);
        const first = next.items[0];
        const last = next.items[next.items.length - 1];
        record({
          target: to,
          direction: directionOf(from, to),
          source: "server",
          reason,
          pageSize,
          ...(first !== undefined && last !== undefined
            ? { fetched: { start: first.offset, end: last.offset } }
            : {}),
        });
      } catch (e) {
        if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [accountId, snapshots, pageSize, moveTo, record],
  );

  // Account, snapshot mode, page size or head offset changed: drop the cache and reload.
  useEffect(() => {
    cancelPending();
    setBatch(null);
    const reason: MoveReason = prevPageSize.current !== pageSize ? "pageSize" : "reload";
    prevPageSize.current = pageSize;
    if (accountId === null || lastOffset < 0) return;
    const to = clampTarget(targetRef.current, lastOffset);
    void load(to, to, reason);
  }, [accountId, snapshots, lastOffset, pageSize, load, cancelPending]);

  const goTo = useCallback(
    (to: number) => {
      if (lastOffset < 0) return;
      const plan = planMove(to, cacheWindow, lastOffset, pageSize);
      if (plan.kind === "cached") {
        cancelPending(); // the newest intent wins over any pending fetch
        record({
          target: plan.target,
          direction: directionOf(targetRef.current, plan.target),
          source: "cache",
          reason: "nav",
          pageSize,
        });
        moveTo(plan.target);
      } else void load(plan.target, plan.fetchOffset, "nav");
    },
    [cacheWindow, lastOffset, pageSize, load, moveTo, cancelPending, record],
  );

  const item = current?.items.find((i) => i.offset === target) ?? null;
  return { target, item, cacheWindow, fetchCount, loading, error, lastMove: moves[0] ?? null, moves, goTo };
}
```

- [ ] **Step 2: Create `useTimeline.ts`:**

```ts
import { useEffect, useState } from "react";
import { timeline } from "./api/client";
import type { TimelineEntry } from "./api/types";

/** Raw event summaries for the timeline strip; reloads whenever the head offset changes. */
export function useTimeline(
  accountId: string | null,
  lastOffset: number,
): { readonly events: readonly TimelineEntry[]; readonly error: string | null } {
  const [events, setEvents] = useState<readonly TimelineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (accountId === null || lastOffset < 0) {
      setEvents([]);
      return;
    }
    timeline(accountId)
      .then((t) => {
        if (!active) return;
        setEvents(t.events);
        setError(null);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [accountId, lastOffset]);

  return { events, error };
}
```

- [ ] **Step 3: Keep the build green.** The existing `src/ReplayPane.tsx` calls `useReplayCursor(accountId, lastOffset, snapshots)`. Pass `20` as the fourth argument for now; Task 6 replaces the file.

Run: `pnpm --filter playground-frontend build` and `pnpm --filter playground-frontend test`. Expected: clean.

- [ ] **Step 4: Gates.** Do not stage or commit.

---

### Task 6: UI — theme, split layout, two-page commands, replay pane

**Files:**
- Create: `src/layout/SplitLayout.tsx`, `src/ui/RiskMeter.tsx`, `src/ui/SourceBadge.tsx`, `src/commands/AccountPicker.tsx`, `src/commands/AccountActions.tsx`, `src/commands/ManualCommand.tsx`, `src/commands/Generator.tsx`, `src/replay/ReplayPane.tsx`, `src/replay/ReplayCard.tsx`, `src/replay/Timeline.tsx`, `src/replay/NavLog.tsx`
- Modify: `src/App.tsx`, `src/styles.css`
- Delete: `src/CommandsPane.tsx`, `src/ReplayPane.tsx`, `src/ReplayCard.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4–5, and `formatAmount`.

- [ ] **Step 1: `styles.css`** (complete file):

```css
:root {
  --hue: 211;
  --bg: #0d1017;
  --bg-glow: radial-gradient(1200px 600px at 10% -10%, hsl(var(--hue) 70% 22% / 0.45), transparent 60%),
    radial-gradient(900px 500px at 110% 110%, hsl(280 60% 25% / 0.3), transparent 60%);
  --text: #dfe5f0;
  --dim: #8d97ab;
  --heading: #ffffff;
  --line: rgb(255 255 255 / 0.08);
  --card: rgb(255 255 255 / 0.05);
  --card-line: rgb(255 255 255 / 0.12);
  --input: rgb(0 0 0 / 0.35);
  --accent: hsl(var(--hue) 85% 62%);
  --accent-text: #0b0d12;
  --danger: #ef5b6b;
  --ok: #3ddc97;
  --cache: hsl(150 80% 60%);
  --cache-bg: hsl(150 70% 18% / 0.7);
  --server: hsl(35 95% 62%);
  --server-bg: hsl(35 90% 18% / 0.7);
  --radius: 16px;
  --radius-sm: 10px;
  --density: 1;
  --gap: calc(10px * var(--density));
  --font: system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); background-image: var(--bg-glow); background-attachment: fixed; color: var(--text); font: 14px/1.45 var(--font); }
h2 { margin: 0 0 var(--gap); color: var(--heading); font-size: 18px; }
h3 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); }

.split { display: grid; height: 100vh; }
.split-pane { min-width: 0; overflow: auto; }
.pane { padding: calc(18px * var(--density)); }
.resizer { cursor: col-resize; background: var(--line); position: relative; outline: none; }
.resizer::after { content: "⋮"; position: absolute; inset: 50% auto auto 50%; transform: translate(-50%, -50%); color: var(--dim); }
.resizer:hover, .resizer:focus-visible, .resizer.dragging { background: var(--accent); }

.card { background: var(--card); border: 1px solid var(--card-line); border-radius: var(--radius); padding: calc(12px * var(--density)); margin-bottom: var(--gap); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 8px 30px rgb(0 0 0 / 0.25); }
.row { display: flex; gap: var(--gap); align-items: center; flex-wrap: wrap; margin-bottom: var(--gap); }
.row.between { justify-content: space-between; }

button { font: inherit; color: var(--text); background: rgb(255 255 255 / 0.07); border: 1px solid var(--card-line); border-radius: var(--radius-sm); padding: 6px 12px; cursor: pointer; transition: transform 0.08s, background 0.15s; }
button:hover:not(:disabled) { transform: translateY(-1px); background: rgb(255 255 255 / 0.12); }
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 600; }
button.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
button.ghost { background: transparent; }
input, select { font: inherit; color: var(--text); background: var(--input); border: 1px solid var(--card-line); border-radius: var(--radius-sm); padding: 5px 9px; }
input[type="number"] { width: 90px; }
input[type="range"] { flex: 1; accent-color: var(--accent); }
label { display: inline-flex; gap: 6px; align-items: center; color: var(--dim); }

.dim { color: var(--dim); }
.mono { font-family: var(--mono); }
.error { color: var(--danger); }
.banner { margin: 0; padding: 8px 16px; background: hsl(355 70% 20% / 0.8); }
.big { font-size: 26px; font-weight: 800; color: var(--heading); letter-spacing: -0.02em; }

.accounts { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.account { display: flex; gap: 10px; align-items: center; cursor: pointer; text-align: left; width: 100%; }
.avatar { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; background: var(--accent); color: var(--accent-text); flex: none; }

.risk { display: flex; gap: 8px; align-items: center; }
.risk-label { font-weight: 700; min-width: 64px; }
.risk-track { flex: 1; height: 10px; border-radius: 6px; background: var(--input); border: 1px solid var(--card-line); overflow: hidden; }
.risk-fill { height: 100%; background: linear-gradient(90deg, #3ddc97, #f5c542, #ef5b6b); transition: width 0.3s; }

.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.badge-cache { background: var(--cache-bg); color: var(--cache); }
.badge-server { background: var(--server-bg); color: var(--server); }

.timeline { display: flex; gap: 1px; height: 34px; align-items: flex-end; margin-bottom: var(--gap); }
.bar { flex: 1; min-width: 0; padding: 0; border: 0; border-radius: 2px 2px 0 0; opacity: 0.45; }
.bar:hover { opacity: 1; transform: none; }
.bar.cached { opacity: 0.85; }
.bar.current { opacity: 1; outline: 2px solid var(--heading); }
.bar-deposit { background: var(--ok); }
.bar-withdraw { background: var(--accent); }
.bar-denied { background: var(--danger); }

.event .section { margin-bottom: var(--gap); }
.event pre { background: var(--input); padding: 8px; border-radius: var(--radius-sm); overflow: auto; font-family: var(--mono); font-size: 12px; }
.slide-forward { animation: slide-in-right 0.25s ease-out; }
.slide-back { animation: slide-in-left 0.25s ease-out; }
@keyframes slide-in-right { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes slide-in-left { from { transform: translateX(-28px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .slide-forward, .slide-back { animation: none; }
  button, .risk-fill { transition: none; }
}

.navlog { font-family: var(--mono); font-size: 12px; max-height: 180px; overflow: auto; }
.navlog div { padding: 1px 0; }
.debug { color: var(--dim); font-size: 12px; font-family: var(--mono); }
```

- [ ] **Step 2: Shared widgets**

`src/ui/RiskMeter.tsx`:

```tsx
export function RiskMeter({ risk }: { readonly risk: number }) {
  const pct = Math.min(100, Math.max(0, risk * 10));
  // Stretch the gradient over the full track so the fill's end color matches the level.
  const backgroundSize = pct > 0 ? `${(100 / pct) * 100}% 100%` : "100% 100%";
  return (
    <div className="risk" title={`risk ${risk} / 10`}>
      <span className="risk-label">risk {risk}</span>
      <div className="risk-track" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={risk}>
        <div className="risk-fill" style={{ width: `${pct}%`, backgroundSize }} />
      </div>
    </div>
  );
}
```

`src/ui/SourceBadge.tsx`:

```tsx
import type { MoveSource } from "../replay/describeMove";

export function SourceBadge({ source }: { readonly source: MoveSource | null }) {
  if (source === null) return null;
  return (
    <span className={`badge badge-${source}`}>{source === "cache" ? "⚡ cache" : "🌐 server"}</span>
  );
}
```

- [ ] **Step 3: `src/layout/SplitLayout.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  clampRatio,
  parseStoredRatio,
  ratioFromPointer,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_STEP,
  SPLIT_STORAGE_KEY,
} from "./splitRatio";

export function SplitLayout({ left, right }: { readonly left: ReactNode; readonly right: ReactNode }) {
  const [ratio, setRatio] = useState(() => parseStoredRatio(localStorage.getItem(SPLIT_STORAGE_KEY)));
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(ratio));
  }, [ratio]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = container.current;
    if (!dragging || box === null) return;
    const r = box.getBoundingClientRect();
    setRatio(ratioFromPointer(e.clientX, r.left, r.width));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  // ←/→ move the split; stop them reaching the replay pane's window key handler.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    setRatio((r) => clampRatio(r + (e.key === "ArrowLeft" ? -SPLIT_STEP : SPLIT_STEP)));
  };

  return (
    <div className="split" ref={container} style={{ gridTemplateColumns: `${ratio}% 8px 1fr` }}>
      <div className="split-pane">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuemin={SPLIT_MIN}
        aria-valuemax={SPLIT_MAX}
        aria-valuenow={ratio}
        tabIndex={0}
        className={`resizer${dragging ? " dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane">{right}</div>
    </div>
  );
}
```

- [ ] **Step 4: Commands pages**

`src/commands/AccountPicker.tsx`:

```tsx
import { useState } from "react";
import type { AccountSummary } from "../api/types";
import { formatAmount } from "../format";

const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Props = {
  readonly accounts: readonly AccountSummary[];
  readonly onSelect: (id: string) => void;
};

export function AccountPicker({ accounts, onSelect }: Props) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function create() {
    const name = newName.trim();
    if (!ACCOUNT_ID.test(name)) {
      setError("Account name: 1-64 letters, digits, '-' or '_'");
      return;
    }
    onSelect(name);
  }

  return (
    <section className="pane">
      <h2>Choose an account</h2>
      <div className="row">
        <input
          placeholder="new account name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <button className="primary" onClick={create}>
          + Create
        </button>
      </div>
      {error !== null && <p className="error">{error}</p>}
      {accounts.length === 0 && <p className="dim">No accounts yet. Create one to start.</p>}
      <div className="accounts">
        {accounts.map((a) => (
          <button key={a.id} className="card account" onClick={() => onSelect(a.id)}>
            <span className="avatar">{a.id.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{a.id}</strong>
              <div className="dim">
                {formatAmount(a.balance.amount, a.balance.currency)} · risk {a.risk} · {a.lastOffset + 1} events
              </div>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

`src/commands/ManualCommand.tsx` is the existing form and log from `CommandsPane.tsx`, scoped to one account:

```tsx
import { useEffect, useState } from "react";
import { ApiError, deposit, withdraw } from "../api/client";
import type { CommandResult } from "../api/types";
import { formatAmount } from "../format";

const LOG_SIZE = 20;
type LogEntry = CommandResult & { readonly value: number };

export function errorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) return "Concurrent write, please retry";
  return e instanceof Error ? e.message : String(e);
}

type Props = {
  readonly accountId: string;
  readonly defaultCurrency: string;
  readonly onDone: () => Promise<void>;
};

export function ManualCommand({ accountId, defaultCurrency, onDone }: Props) {
  const [value, setValue] = useState("100");
  const [currency, setCurrency] = useState(defaultCurrency);
  // The head (and so the account currency) loads after mount; follow it.
  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [defaultCurrency]);
  const [description, setDescription] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(kind: "deposit" | "withdraw") {
    setBusy(true);
    setError(null);
    try {
      const input = {
        value: Number(value),
        currency,
        ...(description.trim() === "" ? {} : { description: description.trim() }),
      };
      const result = kind === "deposit" ? await deposit(accountId, input) : await withdraw(accountId, input);
      setLog((prev) => [{ ...result, value: input.value }, ...prev].slice(0, LOG_SIZE));
      await onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Manual command</h3>
      <div className="row">
        <label>
          value <input type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          currency{" "}
          <input value={currency} maxLength={3} style={{ width: 64 }} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </label>
      </div>
      <div className="row">
        <input placeholder="description (optional)" style={{ flex: 1 }} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void run("deposit")}>
          ▲ Deposit
        </button>
        <button className="danger" disabled={busy} onClick={() => void run("withdraw")}>
          ▼ Withdraw
        </button>
      </div>
      {error !== null && <p className="error">{error}</p>}
      {log.length > 0 && (
        <div className="navlog">
          {log.map((l) => (
            <div key={l.offset}>
              #{l.offset} {l.eventType} {l.value} → {formatAmount(l.views.balance.amount, l.views.balance.currency)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

`src/commands/Generator.tsx`:

```tsx
import { useState } from "react";
import { generate } from "../api/client";
import type { GeneratePattern, GenerateResult } from "../api/types";
import { formatAmount } from "../format";
import { errorText } from "./ManualCommand";

const PATTERNS: ReadonlyArray<{ readonly value: GeneratePattern; readonly label: string }> = [
  { value: "random", label: "🎲 random mix" },
  { value: "riskSpike", label: "📈 risk spike" },
  { value: "riskCoolDown", label: "🧊 risk cool-down" },
  { value: "targetBalance", label: "🎯 target balance" },
];

function toPattern(v: string): GeneratePattern {
  return PATTERNS.find((p) => p.value === v)?.value ?? "random";
}

type Props = {
  readonly accountId: string;
  readonly currency: string | null;
  readonly onDone: () => Promise<void>;
};

export function Generator({ accountId, currency, onDone }: Props) {
  const [count, setCount] = useState("25");
  const [pattern, setPattern] = useState<GeneratePattern>("random");
  const [mode, setMode] = useState<"absolute" | "percent">("absolute");
  const [targetValue, setTargetValue] = useState("5000");
  const [storeEvery, setStoreEvery] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await generate(accountId, {
        count: Number(count),
        pattern,
        storeEvery: Number(storeEvery),
        ...(currency !== null ? { currency } : {}),
        ...(pattern === "targetBalance" ? { target: { mode, value: Number(targetValue) } } : {}),
      });
      setResult(r);
      await onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Generate events</h3>
      <div className="row">
        <label>
          count <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <select value={pattern} onChange={(e) => setPattern(toPattern(e.target.value))}>
          {PATTERNS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {pattern === "targetBalance" && (
        <div className="row">
          <select value={mode} onChange={(e) => setMode(e.target.value === "percent" ? "percent" : "absolute")}>
            <option value="absolute">absolute balance</option>
            <option value="percent">percent of current</option>
          </select>
          <input type="number" step="any" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
          <span className="dim">{mode === "percent" ? "e.g. -30 → 70% of balance" : "end balance"}</span>
        </div>
      )}
      <div className="row">
        <label>
          store every <input type="number" min={1} value={storeEvery} onChange={(e) => setStoreEvery(e.target.value)} /> events
        </label>
        <span className="dim">(snapshot density)</span>
      </div>
      <button className="primary" disabled={busy} onClick={() => void run()}>
        ✨ Generate
      </button>
      {error !== null && <p className="error">{error}</p>}
      {result !== null && (
        <p className="dim">
          offsets {result.fromOffset}–{result.toOffset} · {result.denied} denied · balance{" "}
          {formatAmount(result.views.balance.amount, result.views.balance.currency)}
        </p>
      )}
    </div>
  );
}
```

`src/commands/AccountActions.tsx`:

```tsx
import type { AccountHead } from "../api/types";
import { formatAmount } from "../format";
import { RiskMeter } from "../ui/RiskMeter";
import { Generator } from "./Generator";
import { ManualCommand } from "./ManualCommand";

type Props = {
  readonly accountId: string;
  readonly head: AccountHead | null;
  readonly headLoading: boolean;
  readonly onBack: () => void;
  readonly onDone: () => Promise<void>;
};

export function AccountActions({ accountId, head, headLoading, onBack, onDone }: Props) {
  const currency = head !== null && head.views.balance.currency !== "" ? head.views.balance.currency : null;
  return (
    <section className="pane">
      <div className="row between">
        <button className="ghost" onClick={onBack}>
          ← Switch account
        </button>
        <span className="dim">{head === null ? "" : `${head.lastOffset + 1} events`}</span>
      </div>
      <div className="card">
        <div className="row between">
          <span className="row" style={{ margin: 0 }}>
            <span className="avatar">{accountId.charAt(0).toUpperCase()}</span>
            <strong style={{ fontSize: 18 }}>{accountId}</strong>
          </span>
          <span className="big">
            {head === null
              ? headLoading
                ? "Loading…"
                : "new account"
              : formatAmount(head.views.balance.amount, head.views.balance.currency)}
          </span>
        </div>
        {head !== null && <RiskMeter risk={head.views.risk} />}
      </div>
      <ManualCommand accountId={accountId} defaultCurrency={currency ?? "USD"} onDone={onDone} />
      <Generator accountId={accountId} currency={currency} onDone={onDone} />
    </section>
  );
}
```

- [ ] **Step 5: Replay components**

`src/replay/ReplayCard.tsx`: move the existing `src/ReplayCard.tsx` here and make these changes:
- Root element: `<div className="event">`.
- Each `Section` is wrapped as `<div className="card section">`.
- In the views section, replace `risk <strong>{views.risk}</strong>` with `<RiskMeter risk={views.risk} />` on its own line, imported from `../ui/RiskMeter`.
- Fix the import paths to `../api/types` and `../format`.

`src/replay/Timeline.tsx`:

```tsx
import type { TimelineEntry } from "../api/types";
import type { CacheWindow } from "../replayWindow";
import { barHeight, barKind, inWindow } from "./timelineBars";

type Props = {
  readonly events: readonly TimelineEntry[];
  readonly current: number;
  readonly cacheWindow: CacheWindow | null;
  readonly onJump: (offset: number) => void;
};

export function Timeline({ events, current, cacheWindow, onJump }: Props) {
  if (events.length === 0) return null;
  return (
    <div className="timeline" aria-label="event timeline">
      {events.map((e) => (
        <button
          key={e.offset}
          type="button"
          title={`#${e.offset} ${e.eventType} ${e.value}`}
          className={`bar bar-${barKind(e.eventType)}${inWindow(e.offset, cacheWindow) ? " cached" : ""}${e.offset === current ? " current" : ""}`}
          style={{ height: `${barHeight(e.value)}%` }}
          onClick={() => onJump(e.offset)}
        />
      ))}
    </div>
  );
}
```

`src/replay/NavLog.tsx`:

```tsx
import type { Move } from "./describeMove";
import { describeMove } from "./describeMove";

export function NavLog({ moves }: { readonly moves: readonly Move[] }) {
  if (moves.length === 0) return null;
  return (
    <div className="card">
      <h3>navigation log</h3>
      <div className="navlog">
        {moves.map((m, i) => (
          <div key={moves.length - i}>{describeMove(m)}</div>
        ))}
      </div>
    </div>
  );
}
```

`src/replay/ReplayPane.tsx`: move the existing `src/ReplayPane.tsx` here and change it as follows. Its imports become `../useReplayCursor`, `../useTimeline`, `../ui/SourceBadge`, `./ReplayCard`, `./Timeline` and `./NavLog`.
- Keep the `isTypingTarget`, offset input sync, ←/→ handling, Go guard, empty states and snapshots checkbox.
- Add page-size state:

```ts
const [pageSizeInput, setPageSizeInput] = useState("20");
const [pageSize, setPageSize] = useState(20);
const applyPageSize = () => {
  const n = Number(pageSizeInput);
  if (Number.isInteger(n) && n >= 1 && n <= 200) setPageSize(n);
  else setPageSizeInput(String(pageSize));
};
```

  The input is `<input type="number" min={1} max={200} …>`. Call `applyPageSize` on blur and on Enter.
- Call `useReplayCursor(accountId, lastOffset, snapshots, pageSize)` and `useTimeline(accountId, lastOffset)`.
- Title row: `<div className="row between"><h2 style={{ margin: 0 }}>Replay · {accountId}</h2><SourceBadge source={cursor.lastMove?.source ?? null} /></div>`.
- Above the card: `<Timeline events={timeline.events} current={cursor.target} cacheWindow={cursor.cacheWindow} onJump={cursor.goTo} />`. Show `timeline.error` as `<p className="error">` if it is set.
- Card:

```tsx
<div key={cursor.item.offset} className={cursor.lastMove?.direction === 1 ? "slide-forward" : cursor.lastMove?.direction === -1 ? "slide-back" : ""}>
  <ReplayCard item={cursor.item} />
</div>
```

- Below the card: keep the `debug` line, now `cache: … · server fetches: N`, followed by `<NavLog moves={cursor.moves} />`.
- Step buttons and the Go button use the new button classes (`primary` on Go). The empty states stay inside `<section className="pane">`.

- [ ] **Step 6: `src/App.tsx`** (complete file):

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getHead, listAccounts } from "./api/client";
import type { AccountHead, AccountSummary } from "./api/types";
import { AccountActions } from "./commands/AccountActions";
import { AccountPicker } from "./commands/AccountPicker";
import { SplitLayout } from "./layout/SplitLayout";
import { ReplayPane } from "./replay/ReplayPane";

export function App() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [head, setHead] = useState<AccountHead | null>(null);
  const [headLoading, setHeadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    setAccounts(await listAccounts());
    setError(null);
  }, []);

  const refreshHead = useCallback(async (id: string) => {
    try {
      const next = await getHead(id);
      if (next.streamId === selectedRef.current) setHead(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        if (id === selectedRef.current) setHead(null);
      } else throw e;
    }
  }, []);

  useEffect(() => {
    refreshAccounts().catch((e: Error) => setError(e.message));
  }, [refreshAccounts]);

  useEffect(() => {
    selectedRef.current = selected;
    setHead(null);
    setError(null);
    if (selected === null) {
      setHeadLoading(false);
      refreshAccounts().catch((e: Error) => setError(e.message));
      return;
    }
    setHeadLoading(true);
    refreshHead(selected)
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        if (selectedRef.current === selected) setHeadLoading(false);
      });
  }, [selected, refreshHead, refreshAccounts]);

  const onDone = useCallback(async () => {
    const id = selectedRef.current;
    if (id === null) return;
    await Promise.all([refreshHead(id), refreshAccounts()]);
  }, [refreshHead, refreshAccounts]);

  const left =
    selected === null ? (
      <AccountPicker accounts={accounts} onSelect={setSelected} />
    ) : (
      <AccountActions
        key={selected}
        accountId={selected}
        head={head}
        headLoading={headLoading}
        onBack={() => setSelected(null)}
        onDone={onDone}
      />
    );

  return (
    <>
      {error !== null && <p className="error banner">{error}</p>}
      <SplitLayout
        left={left}
        right={
          <ReplayPane
            key={selected ?? ""}
            accountId={selected}
            lastOffset={head?.lastOffset ?? -1}
            headLoading={headLoading}
          />
        }
      />
    </>
  );
}
```

- [ ] **Step 7: Delete** `src/CommandsPane.tsx`, `src/ReplayPane.tsx` and `src/ReplayCard.tsx`. Check that `main.tsx` still imports `./App` and `./styles.css`.

- [ ] **Step 8: Build + tests**

Run: `pnpm --filter playground-frontend build`, `pnpm --filter playground-frontend test`, `pnpm exec eslint apps/playground`, `pnpm exec prettier --write "apps/playground/**/*.{ts,tsx}"`.
Expected: all clean.

- [ ] **Step 9: Gates.** Do not stage or commit.

---

### Task 7: Deploy, docs, Definition of Done

**Files:**
- Modify: `apps/playground/README.md` (feature list, generate API row, timeline API row, accounts response shape)

- [ ] **Step 1: README.** Add these rows to the API table:
- `POST /api/accounts/:id/generate` with `{ count, pattern, currency?, target?, storeEvery? }`
- `GET /api/accounts/:id/timeline`

Note the new `/api/accounts` response shape. Add a "What to check" bullet: "⚡/🌐 badge and the navigation log match where data came from; after a page-size change the log shows ♻." Add a line on `storeEvery`: it controls snapshot density, so replay has to fold from older snapshots.

- [ ] **Step 2: Deploy** (the context must be `docker-desktop`):

```bash
kubectl config current-context   # must print docker-desktop
pnpm playground:deploy           # must end with "Playground ready: http://localhost:8080"
curl -fsS -XPOST localhost:8080/api/accounts/v2-check/generate -H 'content-type: application/json' -d '{"count":25,"pattern":"random","storeEvery":4}'
curl -fsS localhost:8080/api/accounts/v2-check/timeline | head -c 300
curl -fsS 'localhost:8080/api/accounts/v2-check/replay?offset=10&batchSize=5'
curl -fsS localhost:8080/api/accounts | head -c 300
```

Expected:
- The generate response has `fromOffset` 0 and `toOffset` 24.
- The timeline has 25 events.
- The replay returns 5 items starting at offset 10.
- The accounts entries have `id`, `lastOffset`, `balance` and `risk`.

- [ ] **Step 3: Definition of Done**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l        # 0
pnpm exec eslint . 2>&1 | grep -c " error "       # 0
pnpm lint
pnpm exec prettier --check "apps/playground/**/*.{ts,tsx}"
pnpm --filter playground-frontend build
pnpm --filter playground-frontend test
pnpm --filter playground-backend test             # Docker up
pnpm test                                         # full root suite
```

Record every output.

- [ ] **Step 4: Manual checklist.** Report each item as done, or as not possible without a browser:
- The badge shows ⚡ inside the window and 🌐 outside it.
- After a page-size change, the log shows ♻.
- The split ratio survives a reload.
- ←/→ on the focused resizer moves the split, not the cursor.
- The slide direction matches the step.
- Reduced motion turns off the animation.

Leave the playground running. Do not stage or commit.
