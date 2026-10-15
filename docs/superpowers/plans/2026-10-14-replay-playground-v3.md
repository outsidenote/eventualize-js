# Replay Playground v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side pattern detection with centred jump-to-match navigation, and rework the replay pane: offset/stats widgets with ▲/▼ deltas, a payload card, no animation, no `event_meta`.

**Architecture:**
- The backend reads a `{offset, balance, risk}` series through the library's own replay path (`goToOffset(0)` + `forward()`), then runs a pure edge-triggered `detect()`.
- The frontend adds pure helpers (centred page start, match stepping, deltas, parameter building), a `goToCentered` cursor method, and a `useDetection` hook. New presentational widgets replace the old card.

**Tech Stack:** TypeScript 6, Express 4, React 18, Vite 5, node:test + tsx, testcontainers Postgres, Docker Desktop Kubernetes.

**Spec:** [docs/superpowers/specs/2026-10-14-replay-playground-v3-design.md](../specs/2026-10-14-replay-playground-v3-design.md)

## Global Constraints

- pnpm only. No new runtime dependencies.
- Type safety:
  - No `any`, no `as` casts (not even `as const`).
  - `unknown` only for HTTP bodies, queries and caught errors, narrowed at once.
  - Do not use `Object.entries`/`Object.values` on an `unknown`-narrowed `object`: they return `any`. Use literal `"key" in obj` narrowing. `Object.keys` is fine.
  - Existing accepted exceptions stay as they are: `client.ts` `const data: T = await res.json()`, backend tests' `res.json()`, and the test-only `InMemoryStorageAdapter` snapshot state.
- `import type` for type-only imports.
- Detector limits:
  - `jump` 0 < x ≤ 10, default 2.5;
  - `percent` 0 < x ≤ 1000, required;
  - `window` integer 1–1000, default 5;
  - `threshold` finite, abs ≤ 1e12, required.
- `RISK_FLOOR = 0.5`, `MAX_SCAN = 20_000`, `MAX_MATCHES = 1_000`.
- Page size 1–200 (`MAX_PAGE_SIZE = 200`). A centred start is `clamp(offset − floor(pageSize/2), 0, max(0, lastOffset − pageSize + 1))`.
- UI choices (spec §3.1), verbatim:
  - widgets side by side;
  - offset widget = progress ring + balance + risk meter;
  - stats widget = 3 tiles (▲ deposits green, ▼ withdrawals accent, ⛔ denied red);
  - ▲/▼ deltas versus the previous offset, green for up and red for down;
  - payload as a key/value table + messages, placed above navigation;
  - detection card with a dashed amber border and a dropdown;
  - amber ▼ timeline markers;
  - no slide animation, no `event_meta`.
- Baseline: build 0 `error TS`, eslint 0 errors. Run prettier on `apps/playground/**/*.{ts,tsx}`.
- **No `git add`, no `git commit`, no `git stash`.**
- Do not touch `packages/`, `apps/sample-app/src/tests/integration.test.ts` or `packages/core/src/factories/EvDbStreamFactory.clone.test.ts`.
- kubectl state changes only under the `docker-desktop` context.
- Tests:
  - Backend: `pnpm --filter playground-backend test`, which needs Docker.
  - Frontend: `pnpm --filter playground-frontend test` and `pnpm --filter playground-frontend build`.

## Review Focus

1. **Edge triggering.** A run of consecutive true conditions must give exactly one match, at its first offset. A condition that turns false and then true again gives a second match. Tests in Task 1.
2. **Window / previous-event bounds.** There is no match before N = window (rise/decline) or at N = 0 (jump, crossings). There is no crash on an empty or one-point series. Task 1.
3. **Hostile detect bodies.** All of these give 400, never 500: an unknown detector, missing `params`, extra parameters, the wrong type, out of range, `window` 2.5. Task 2.
4. **Centring at the stream edges.** A match at offset 2 with page size 20 starts at 0. A match at the last offset starts at `lastOffset − 19`. A stream shorter than the page starts at 0. Task 3.
5. **Deltas with no previous item.** Offset 0, or a previous item outside the batch, must render no ▲/▼, never a wrong one. The cursor fetches one item before the requested start so the previous item is normally present. Tasks 3–5.
6. **Jump for another account.** A "▶ view" jump requested on account A never applies on account B. Task 5.

---

## File Map

```
backend/src/detection/detect.ts (+ detect.test.ts)     create  Detector, SeriesPoint, RISK_FLOOR, detect()
backend/src/detection/series.ts (+ series.test.ts)     create  readSeries()
backend/src/detection/runDetection.ts                  create  MAX_SCAN, MAX_MATCHES, runDetection()
backend/src/http/validation.ts                         modify  parseDetectBody
backend/src/http/createApp.ts (+ test)                 modify  POST /api/accounts/:id/detect
backend/src/tests/api.integration.test.ts              modify  detect on Postgres
frontend/src/money.ts                                   create  cents()
frontend/src/api/types.ts, api/client.ts                modify  DetectorKind, DetectRequest, DetectResult, detect()
frontend/src/replay/matchNav.ts (+ test)                create  MAX_PAGE_SIZE, centeredStart, stepMatch
frontend/src/replay/detectors.ts (+ test)               create  DETECTORS, buildDetectRequest
frontend/src/ui/delta.ts (+ test)                       create  deltaOf
frontend/src/replay/describeMove.ts (+ test)            modify  reason "match"
frontend/src/useReplayCursor.ts                         modify  previous, goToCentered, fetch one-before
frontend/src/useDetection.ts                            create
frontend/src/ui/Delta.tsx, replay/OffsetWidget.tsx, replay/StatsWidget.tsx, replay/PayloadCard.tsx, replay/DetectionCard.tsx   create
frontend/src/replay/ReplayCard.tsx                      delete  (replaced by PayloadCard)
frontend/src/replay/Timeline.tsx, replay/ReplayPane.tsx, App.tsx, commands/ManualCommand.tsx, styles.css   modify
apps/playground/README.md                               modify
```

---

### Task 1: Pure detector

**Files:**
- Create: `apps/playground/backend/src/detection/detect.ts`, `src/detection/detect.test.ts`

**Interfaces:**
- Produces:
  - `type DetectorKind = "riskJump" | "riskRise" | "riskDecline" | "balanceCrossUp" | "balanceCrossDown"`
  - `type Detector`, a discriminated union on `kind` (code below)
  - `type SeriesPoint = { readonly offset: number; readonly balance: number; readonly risk: number }`
  - `RISK_FLOOR = 0.5`
  - `isDetectorKind(v: string): v is DetectorKind`
  - `detect(points: readonly SeriesPoint[], detector: Detector): number[]`

- [ ] **Step 1: Write failing tests**

`src/detection/detect.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { detect, isDetectorKind } from "./detect.js";
import type { SeriesPoint } from "./detect.js";

const series = (risks: number[], balances?: number[]): SeriesPoint[] =>
  risks.map((risk, offset) => ({ offset, risk, balance: balances?.[offset] ?? 0 }));

describe("detect", () => {
  test("empty and one-point series never match", () => {
    for (const d of [
      { kind: "riskJump", jump: 1 },
      { kind: "riskRise", percent: 10, window: 1 },
      { kind: "balanceCrossUp", threshold: 0 },
    ] satisfies Parameters<typeof detect>[1][]) {
      assert.deepStrictEqual(detect([], d), []);
      assert.deepStrictEqual(detect(series([5], [5]), d), []);
    }
  });

  test("riskJump: edge-triggered, offset 0 never matches", () => {
    // jumps at 1 (0→3), 2 (3→6) form one run; 3 (6→6) breaks it; 4 (6→9) starts a new run
    assert.deepStrictEqual(detect(series([0, 3, 6, 6, 9, 9.5]), { kind: "riskJump", jump: 2.5 }), [1, 4]);
  });

  test("riskJump catches drops too (absolute change)", () => {
    assert.deepStrictEqual(detect(series([9, 9, 4]), { kind: "riskJump", jump: 3 }), [2]);
  });

  test("riskRise: compares to window events earlier, uses RISK_FLOOR for 0", () => {
    // window 2: N=2: (2-0)/0.5=400% ≥ 100 ✓ ; N=3: (2-1)/1=100% ✓ (same run) ; N=4: (2-2)/2=0 ✗ ; N=5: (5-2)/2=150% ✓ new run
    const pts = series([0, 1, 2, 2, 2, 5]);
    assert.deepStrictEqual(detect(pts, { kind: "riskRise", percent: 100, window: 2 }), [2, 5]);
  });

  test("riskRise: no match before N = window", () => {
    assert.deepStrictEqual(detect(series([0, 10]), { kind: "riskRise", percent: 1, window: 2 }), []);
  });

  test("riskDecline mirrors riskRise", () => {
    // window 1: N=1 (10→5) -50% ✓ ; N=2 (5→5) ✗ ; N=3 (5→1) -80% ✓
    assert.deepStrictEqual(
      detect(series([10, 5, 5, 1]), { kind: "riskDecline", percent: 50, window: 1 }),
      [1, 3],
    );
  });

  test("balanceCrossUp / Down at the exact threshold", () => {
    const pts = series([0, 0, 0, 0, 0], [99.99, 100, 150, 99.99, 100]);
    assert.deepStrictEqual(detect(pts, { kind: "balanceCrossUp", threshold: 100 }), [1, 4]);
    assert.deepStrictEqual(detect(pts, { kind: "balanceCrossDown", threshold: 100 }), [3]);
  });

  test("crossings are cents-safe", () => {
    const pts = series([0, 0], [0.1 + 0.2 - 0.01, 0.1 + 0.2]);
    assert.deepStrictEqual(detect(pts, { kind: "balanceCrossUp", threshold: 0.3 }), [1]);
  });

  test("isDetectorKind", () => {
    assert.ok(isDetectorKind("riskJump") && isDetectorKind("balanceCrossDown"));
    assert.ok(!isDetectorKind("riskSpike"));
  });
});
```

Run: `node --import tsx --test apps/playground/backend/src/detection/detect.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 2: Implement** `src/detection/detect.ts`:

```ts
import { cents } from "../domain/money.js";

export type DetectorKind =
  | "riskJump"
  | "riskRise"
  | "riskDecline"
  | "balanceCrossUp"
  | "balanceCrossDown";

export type Detector =
  | { readonly kind: "riskJump"; readonly jump: number }
  | { readonly kind: "riskRise"; readonly percent: number; readonly window: number }
  | { readonly kind: "riskDecline"; readonly percent: number; readonly window: number }
  | { readonly kind: "balanceCrossUp"; readonly threshold: number }
  | { readonly kind: "balanceCrossDown"; readonly threshold: number };

export type SeriesPoint = {
  readonly offset: number;
  readonly balance: number;
  readonly risk: number;
};

/** Base used for percent changes so a rise from risk 0 is finite. */
export const RISK_FLOOR = 0.5;

export function isDetectorKind(v: string): v is DetectorKind {
  return (
    v === "riskJump" ||
    v === "riskRise" ||
    v === "riskDecline" ||
    v === "balanceCrossUp" ||
    v === "balanceCrossDown"
  );
}

/** Percent change of risk from `window` points earlier, or null when there is no such point. */
function riskChangePercent(points: readonly SeriesPoint[], i: number, window: number): number | null {
  const before = points[i - window];
  const now = points[i];
  if (before === undefined || now === undefined) return null;
  return ((now.risk - before.risk) / Math.max(before.risk, RISK_FLOOR)) * 100;
}

function holds(points: readonly SeriesPoint[], i: number, d: Detector): boolean {
  const now = points[i];
  const prev = points[i - 1];
  if (now === undefined) return false;
  switch (d.kind) {
    case "riskJump":
      return prev !== undefined && Math.abs(now.risk - prev.risk) >= d.jump;
    case "riskRise": {
      const change = riskChangePercent(points, i, d.window);
      return change !== null && change >= d.percent;
    }
    case "riskDecline": {
      const change = riskChangePercent(points, i, d.window);
      return change !== null && -change >= d.percent;
    }
    case "balanceCrossUp":
      return prev !== undefined && cents(prev.balance) < d.threshold && cents(now.balance) >= d.threshold;
    case "balanceCrossDown":
      return prev !== undefined && cents(prev.balance) >= d.threshold && cents(now.balance) < d.threshold;
  }
}

/**
 * Edge-triggered detection: returns the offset where each run of true conditions
 * starts, in ascending order.
 */
export function detect(points: readonly SeriesPoint[], detector: Detector): number[] {
  const matches: number[] = [];
  let previous = false;
  for (let i = 0; i < points.length; i++) {
    const current = holds(points, i, detector);
    const point = points[i];
    if (current && !previous && point !== undefined) matches.push(point.offset);
    previous = current;
  }
  return matches;
}
```

Note: the test file uses `satisfies Parameters<typeof detect>[1][]`. `satisfies` is not a cast. If it fails to type-check, type the array as `Detector[]` and import `type Detector`.

- [ ] **Step 3: Run, expect pass**

Run: `node --import tsx --test apps/playground/backend/src/detection/detect.test.ts`. Expected: all pass.

- [ ] **Step 4: Gates.** Do not stage or commit.

---

### Task 2: Series reader, HTTP route, Postgres test

**Files:**
- Create: `apps/playground/backend/src/detection/series.ts`, `src/detection/series.test.ts`, `src/detection/runDetection.ts`
- Modify: `src/http/validation.ts`, `src/http/createApp.ts`, `src/http/createApp.test.ts`, `src/tests/api.integration.test.ts`

**Interfaces:**
- Consumes: `detect`, `Detector`, `SeriesPoint`, `isDetectorKind` (Task 1).
- Produces:
  - `readSeries(storage: PlaygroundStorage, streamId: string, maxScan: number): Promise<{ points: SeriesPoint[]; lastOffset: number; truncated: boolean }>`
  - `MAX_SCAN = 20_000`; `MAX_MATCHES = 1_000`
  - `type DetectResult = { readonly detector: DetectorKind; readonly matches: number[]; readonly scanned: number; readonly lastOffset: number; readonly truncated: boolean }`
  - `runDetection(storage, streamId, detector, limits?: { maxScan: number; maxMatches: number }): Promise<DetectResult>`
  - `parseDetectBody(body: unknown): Detector`
  - Route `POST /api/accounts/:id/detect` → `DetectResult`

- [ ] **Step 1: Write failing tests**

`src/detection/series.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { readSeries } from "./series.js";
import { generate } from "../generator/generate.js";
import { NotFoundError } from "../errors.js";
import { seededRng } from "../tests/seededRng.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";
import { replayBatch } from "../replay/replayBatch.js";

describe("readSeries", () => {
  test("points equal the replayed views at every offset", async () => {
    const s = new InMemoryStorageAdapter();
    await generate(s, "a", { count: 30, pattern: "random", storeEvery: 4 }, seededRng(11));
    const series = await readSeries(s, "a", 20_000);
    assert.strictEqual(series.points.length, 30);
    assert.strictEqual(series.lastOffset, 29);
    assert.strictEqual(series.truncated, false);
    const batch = await replayBatch(s, "a", { offset: 0, batchSize: 200, snapshots: false });
    assert.deepStrictEqual(
      series.points,
      batch.items.map((i) => ({ offset: i.offset, balance: i.views.balance.amount, risk: i.views.risk })),
    );
  });

  test("maxScan truncates", async () => {
    const s = new InMemoryStorageAdapter();
    await generate(s, "b", { count: 10, pattern: "riskCoolDown", storeEvery: 1 }, seededRng(12));
    const series = await readSeries(s, "b", 4);
    assert.deepStrictEqual(series.points.map((p) => p.offset), [0, 1, 2, 3]);
    assert.strictEqual(series.truncated, true);
  });

  test("unknown account", async () => {
    await assert.rejects(readSeries(new InMemoryStorageAdapter(), "none", 10), (e) => e instanceof NotFoundError);
  });
});
```

Add to `src/http/createApp.test.ts`:

```ts
  test("POST detect returns edge-triggered offsets", async () => {
    await post("/api/accounts/det1/generate", JSON.stringify({ count: 5, pattern: "riskSpike" }));
    const res = await post(
      "/api/accounts/det1/detect",
      JSON.stringify({ detector: "riskJump", params: { jump: 2.5 } }),
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    // risk 3, 6, 9, 10, 10 → jumps at 1 and 2 form one run
    assert.deepStrictEqual(body, { detector: "riskJump", matches: [1], scanned: 5, lastOffset: 4, truncated: false });
  });

  test("400 on hostile detect bodies, 404 on unknown account", async () => {
    await post("/api/accounts/det2/generate", JSON.stringify({ count: 2, pattern: "riskSpike" }));
    const bodies = [
      {},
      { detector: "riskSpike", params: {} },
      { detector: "riskJump" },
      { detector: "riskJump", params: { jump: 0 } },
      { detector: "riskJump", params: { jump: 11 } },
      { detector: "riskJump", params: { jump: "2" } },
      { detector: "riskJump", params: { jump: 2, window: 3 } },
      { detector: "riskRise", params: { window: 5 } },
      { detector: "riskRise", params: { percent: -1, window: 5 } },
      { detector: "riskRise", params: { percent: 10, window: 0 } },
      { detector: "riskRise", params: { percent: 10, window: 2.5 } },
      { detector: "riskDecline", params: { percent: 1001 } },
      { detector: "balanceCrossUp", params: {} },
      { detector: "balanceCrossUp", params: { threshold: "x" } },
      { detector: "balanceCrossDown", params: { threshold: 1e13 } },
    ];
    for (const b of bodies) {
      const res = await post("/api/accounts/det2/detect", JSON.stringify(b));
      assert.strictEqual(res.status, 400, JSON.stringify(b));
    }
    const res = await post(
      "/api/accounts/nobody/detect",
      JSON.stringify({ detector: "riskJump", params: {} }),
    );
    assert.strictEqual(res.status, 404);
  });
```

(`{ detector: "riskJump", params: {} }` is valid, because `jump` defaults to 2.5. That is why the unknown account gives 404 rather than 400.)

Run: `pnpm --filter playground-backend test`. Expected: the new tests fail.

- [ ] **Step 2: Implement**

`src/detection/series.ts`:

```ts
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import { STREAM_TYPE } from "../domain/streamType.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";
import type { SeriesPoint } from "./detect.js";

/**
 * Balance and risk at every offset, read through the library replay path
 * (goToOffset(0) + forward(), no snapshots) so detection agrees with what replay shows.
 */
export async function readSeries(
  storage: PlaygroundStorage,
  streamId: string,
  maxScan: number,
): Promise<{ points: SeriesPoint[]; lastOffset: number; truncated: boolean }> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  const stream = await PlaygroundFundsStreamFactory.goToOffset(streamId, 0, storage);
  const point = (): SeriesPoint => ({
    offset: stream.event.streamCursor.offset,
    balance: stream.views.balance.amount,
    risk: stream.views.risk,
  });
  const points: SeriesPoint[] = [point()];
  while (!stream.isHead && points.length < maxScan) {
    const before = stream.event.streamCursor.offset;
    await stream.forward();
    if (stream.event.streamCursor.offset === before) break;
    points.push(point());
  }
  return { points, lastOffset, truncated: !stream.isHead };
}
```

`src/detection/runDetection.ts`:

```ts
import type { PlaygroundStorage } from "../storage.js";
import { detect } from "./detect.js";
import type { Detector, DetectorKind } from "./detect.js";
import { readSeries } from "./series.js";

export const MAX_SCAN = 20_000;
export const MAX_MATCHES = 1_000;

export type DetectResult = {
  readonly detector: DetectorKind;
  readonly matches: number[];
  readonly scanned: number;
  readonly lastOffset: number;
  readonly truncated: boolean;
};

export async function runDetection(
  storage: PlaygroundStorage,
  streamId: string,
  detector: Detector,
  limits: { readonly maxScan: number; readonly maxMatches: number } = {
    maxScan: MAX_SCAN,
    maxMatches: MAX_MATCHES,
  },
): Promise<DetectResult> {
  const series = await readSeries(storage, streamId, limits.maxScan);
  const all = detect(series.points, detector);
  return {
    detector: detector.kind,
    matches: all.slice(0, limits.maxMatches),
    scanned: series.points.length,
    lastOffset: series.lastOffset,
    truncated: series.truncated || all.length > limits.maxMatches,
  };
}
```

`src/http/validation.ts`, append. Import `isDetectorKind` and `type Detector` from `../detection/detect.js`, and reuse the existing `MAX_AMOUNT`.

```ts
const DETECTOR_PARAMS: Readonly<Record<string, readonly string[]>> = {
  riskJump: ["jump"],
  riskRise: ["percent", "window"],
  riskDecline: ["percent", "window"],
  balanceCrossUp: ["threshold"],
  balanceCrossDown: ["threshold"],
};

function numberIn(raw: unknown, name: string, min: number, max: number, minExclusive: boolean): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw > max || (minExclusive ? raw <= min : raw < min)) {
    throw new ValidationError(`${name} must be a number in ${minExclusive ? "(" : "["}${min}, ${max}]`);
  }
  return raw;
}

export function parseDetectBody(body: unknown): Detector {
  if (typeof body !== "object" || body === null) throw new ValidationError("body must be a JSON object");
  const kind = "detector" in body ? body.detector : undefined;
  if (typeof kind !== "string" || !isDetectorKind(kind)) {
    throw new ValidationError("detector must be riskJump, riskRise, riskDecline, balanceCrossUp or balanceCrossDown");
  }
  const params = "params" in body ? body.params : undefined;
  if (typeof params !== "object" || params === null) throw new ValidationError("params must be an object");
  const allowed = DETECTOR_PARAMS[kind] ?? [];
  const extra = Object.keys(params).filter((k) => !allowed.includes(k));
  if (extra.length > 0) throw new ValidationError(`unknown params for ${kind}: ${extra.join(", ")}`);

  const jump = "jump" in params ? params.jump : undefined;
  const percent = "percent" in params ? params.percent : undefined;
  const windowRaw = "window" in params ? params.window : undefined;
  const threshold = "threshold" in params ? params.threshold : undefined;

  switch (kind) {
    case "riskJump":
      return { kind, jump: jump === undefined ? 2.5 : numberIn(jump, "jump", 0, 10, true) };
    case "riskRise":
    case "riskDecline": {
      const window =
        windowRaw === undefined ? 5 : parseIntField(windowRaw, "window", 1, 1000);
      return { kind, percent: numberIn(percent, "percent", 0, 1000, true), window };
    }
    case "balanceCrossUp":
    case "balanceCrossDown":
      return { kind, threshold: numberIn(threshold, "threshold", -MAX_AMOUNT, MAX_AMOUNT, false) };
  }
}
```

Note: `parseIntField` already exists in this file from v2; reuse it. Check that the discriminated union narrows `kind` correctly in each `return`. If TypeScript cannot narrow the shared `case "riskRise": case "riskDecline":` branch, split it into two cases. No casts.

`src/http/createApp.ts`: import `runDetection` and `parseDetectBody`, then add:

```ts
  app.post(
    "/api/accounts/:id/detect",
    handle<AccountParams>(async (req, res) => {
      const id = parseAccountId(req.params.id);
      res.json(await runDetection(storage, id, parseDetectBody(req.body)));
    }),
  );
```

- [ ] **Step 3: Postgres integration.** Append this as the last test in `src/tests/api.integration.test.ts`:

```ts
  test("detect on Postgres equals detect() over a manual fold", async () => {
    assert.strictEqual((await send("/api/accounts/det/generate", { count: 5, pattern: "riskSpike", storeEvery: 2 })).status, 200);
    assert.strictEqual((await send("/api/accounts/det/generate", { count: 20, pattern: "riskCoolDown", storeEvery: 3 })).status, 200);
    const reference = await replayFor("det", 0, 200, false);
    const points = reference.items.map((i) => ({ offset: i.offset, balance: i.views.balance.amount, risk: i.views.risk }));
    const cases = [
      { detector: "riskJump", params: { jump: 2.5 } },
      { detector: "riskDecline", params: { percent: 50, window: 5 } },
      { detector: "balanceCrossUp", params: { threshold: 50_000 } },
    ];
    for (const c of cases) {
      const res = await send("/api/accounts/det/detect", c);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      const expected = detect(points, parseDetectBody(c));
      assert.deepStrictEqual(body.matches, expected, JSON.stringify(c));
      assert.strictEqual(body.scanned, 25);
    }
    const jump = await (await send("/api/accounts/det/detect", cases[0])).json();
    assert.deepStrictEqual(jump.matches, [1]);
  });
```

Add the imports `detect` from `../detection/detect.js` and `parseDetectBody` from `../http/validation.js`.

- [ ] **Step 4: Run, expect pass.** Run `pnpm --filter playground-backend test`. Expected: all pass.

- [ ] **Step 5: Gates.** Do not stage or commit.

---

### Task 3: Frontend pure helpers + API

**Files:**
- Create: `apps/playground/frontend/src/money.ts`
- Create, each with a `.test.ts`: `src/replay/matchNav.ts`, `src/replay/detectors.ts`, `src/ui/delta.ts`
- Modify: `src/replay/describeMove.ts` (+ test), `src/api/types.ts`, `src/api/client.ts`, `src/commands/ManualCommand.tsx` (use `cents` in the log)

**Interfaces:**
- Produces:
  - `cents(n)`
  - `MAX_PAGE_SIZE = 200`, `centeredStart(offset, pageSize, lastOffset)`, `stepMatch(index, delta, count)`
  - `type DetectorKind`, `type DetectRequest = { readonly detector: DetectorKind; readonly params: { readonly [key: string]: number } }`, `type DetectResult`
  - `DETECTORS`: an array of `{ kind, label, params: { key, label, initial }[] }`
  - `buildDetectRequest(kind, inputs: { readonly [key: string]: string }): { ok: true; request: DetectRequest } | { ok: false; error: string }`
  - `deltaOf(current: number, previous: number | null): { sign: 1 | -1 | 0; abs: number }`
  - `MoveReason` gains `"match"`
  - client `detect(id, request): Promise<DetectResult>`

- [ ] **Step 1: Write failing tests**

`src/replay/matchNav.test.ts`:

```ts
import { test } from "node:test";
import * as assert from "node:assert";
import { centeredStart, stepMatch } from "./matchNav";

test("centeredStart centres and clamps at both edges", () => {
  assert.strictEqual(centeredStart(50, 20, 159), 40);
  assert.strictEqual(centeredStart(51, 20, 159), 41);
  assert.strictEqual(centeredStart(2, 20, 159), 0);
  assert.strictEqual(centeredStart(159, 20, 159), 140);
  assert.strictEqual(centeredStart(5, 20, 9), 0);
  assert.strictEqual(centeredStart(7, 1, 100), 7);
  assert.strictEqual(centeredStart(7, 3, 100), 6);
});

test("stepMatch clamps to 0..count-1", () => {
  assert.strictEqual(stepMatch(0, -1, 5), 0);
  assert.strictEqual(stepMatch(0, 1, 5), 1);
  assert.strictEqual(stepMatch(4, 1, 5), 4);
  assert.strictEqual(stepMatch(0, 1, 0), 0);
});
```

`src/ui/delta.test.ts`:

```ts
import { test } from "node:test";
import * as assert from "node:assert";
import { deltaOf } from "./delta";

test("deltaOf", () => {
  assert.deepStrictEqual(deltaOf(10, 7), { sign: 1, abs: 3 });
  assert.deepStrictEqual(deltaOf(7, 10), { sign: -1, abs: 3 });
  assert.deepStrictEqual(deltaOf(5, 5), { sign: 0, abs: 0 });
  assert.deepStrictEqual(deltaOf(5, null), { sign: 0, abs: 0 });
  assert.deepStrictEqual(deltaOf(0.1 + 0.2, 0.3), { sign: 0, abs: 0 });
  // cents(1.005 - 1) = cents(0.00499…) = 0: sub-cent noise is not a change
  assert.deepStrictEqual(deltaOf(1.005, 1), { sign: 0, abs: 0 });
  assert.deepStrictEqual(deltaOf(1.02, 1), { sign: 1, abs: 0.02 });
});
```


`src/replay/detectors.test.ts`:

```ts
import { test } from "node:test";
import * as assert from "node:assert";
import { buildDetectRequest, DETECTORS } from "./detectors";

test("DETECTORS lists the five kinds with their params", () => {
  assert.deepStrictEqual(
    DETECTORS.map((d) => [d.kind, d.params.map((p) => p.key)]),
    [
      ["riskJump", ["jump"]],
      ["riskRise", ["percent", "window"]],
      ["riskDecline", ["percent", "window"]],
      ["balanceCrossUp", ["threshold"]],
      ["balanceCrossDown", ["threshold"]],
    ],
  );
});

test("buildDetectRequest sends only the detector's params, as numbers", () => {
  assert.deepStrictEqual(buildDetectRequest("riskRise", { percent: "50", window: "5", jump: "9" }), {
    ok: true,
    request: { detector: "riskRise", params: { percent: 50, window: 5 } },
  });
});

test("buildDetectRequest rejects empty or non-numeric input", () => {
  assert.deepStrictEqual(buildDetectRequest("balanceCrossUp", { threshold: "" }), { ok: false, error: "threshold must be a number" });
  assert.deepStrictEqual(buildDetectRequest("riskJump", { jump: "abc" }), { ok: false, error: "jump must be a number" });
});
```

Add to `src/replay/describeMove.test.ts`:

```ts
test("describeMove for a match jump", () => {
  assert.strictEqual(
    describeMove({ target: 40, direction: 1, source: "server", reason: "match", pageSize: 20, fetched: { start: 30, end: 49 } }),
    "🎯 match → 40 fetched 30–49",
  );
});
```

Run: `pnpm --filter playground-frontend test`. Expected: FAIL.

- [ ] **Step 2: Implement**

`src/money.ts`:

```ts
/** Rounds to cents, the same rule the backend uses (domain/money.ts). */
export function cents(n: number): number {
  return Math.round(n * 100) / 100;
}
```

`src/replay/matchNav.ts`:

```ts
export const MAX_PAGE_SIZE = 200;

/** First offset of a page of `pageSize` that has `offset` in the middle, kept inside the stream. */
export function centeredStart(offset: number, pageSize: number, lastOffset: number): number {
  const ideal = offset - Math.floor(pageSize / 2);
  return Math.min(Math.max(ideal, 0), Math.max(0, lastOffset - pageSize + 1));
}

export function stepMatch(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}
```

Check with the tests: `centeredStart(7, 3, 100)` gives `7 − 1 = 6`, so the page is 6..8 with 7 in the middle. `centeredStart(50, 20, 159)` gives 40, so the page is 40..59 and 50 is at index 10.

`src/ui/delta.ts`:

```ts
import { cents } from "../money";

export type Delta = { readonly sign: 1 | -1 | 0; readonly abs: number };

/** Change versus the previous offset, in cents. No previous value means no change shown. */
export function deltaOf(current: number, previous: number | null): Delta {
  if (previous === null) return { sign: 0, abs: 0 };
  const d = cents(current - previous);
  return { sign: d > 0 ? 1 : d < 0 ? -1 : 0, abs: Math.abs(d) };
}
```

`src/replay/detectors.ts`:

```ts
import type { DetectorKind, DetectRequest } from "../api/types";

export type DetectorDef = {
  readonly kind: DetectorKind;
  readonly label: string;
  readonly params: ReadonlyArray<{ readonly key: string; readonly label: string; readonly initial: string }>;
};

export const DETECTORS: readonly DetectorDef[] = [
  { kind: "riskJump", label: "⚡ risk jump", params: [{ key: "jump", label: "jump ≥", initial: "2.5" }] },
  {
    kind: "riskRise",
    label: "📈 risk rise %",
    params: [
      { key: "percent", label: "rise ≥ %", initial: "50" },
      { key: "window", label: "window", initial: "5" },
    ],
  },
  {
    kind: "riskDecline",
    label: "📉 risk decline %",
    params: [
      { key: "percent", label: "decline ≥ %", initial: "50" },
      { key: "window", label: "window", initial: "5" },
    ],
  },
  { kind: "balanceCrossUp", label: "⬆️ balance crosses up", params: [{ key: "threshold", label: "threshold", initial: "50000" }] },
  { kind: "balanceCrossDown", label: "⬇️ balance crosses down", params: [{ key: "threshold", label: "threshold", initial: "50000" }] },
];

export function detectorDef(kind: DetectorKind): DetectorDef {
  return DETECTORS.find((d) => d.kind === kind) ?? DETECTORS[0];
}

export function buildDetectRequest(
  kind: DetectorKind,
  inputs: { readonly [key: string]: string },
): { readonly ok: true; readonly request: DetectRequest } | { readonly ok: false; readonly error: string } {
  const params: { [key: string]: number } = {};
  for (const p of detectorDef(kind).params) {
    const raw = (inputs[p.key] ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) return { ok: false, error: `${p.key} must be a number` };
    params[p.key] = n;
  }
  return { ok: true, request: { detector: kind, params } };
}
```

If `DETECTORS[0]` is typed as possibly `undefined` under `noUncheckedIndexedAccess`, it is not, because that option is off in this tsconfig. Keep `?? DETECTORS[0]` as written; it compiles.

`src/replay/describeMove.ts`:
- Change the reason type to `export type MoveReason = "nav" | "reload" | "pageSize" | "match";`.
- In `describeMove`, extend the prefix: `m.reason === "match" ? "🎯 match " : …`, so a match move renders `🎯 match → 40 fetched 30–49`. Keep all other strings unchanged; the existing tests must stay green.

`src/api/types.ts`, append:

```ts
export type DetectorKind =
  | "riskJump"
  | "riskRise"
  | "riskDecline"
  | "balanceCrossUp"
  | "balanceCrossDown";

export type DetectRequest = {
  readonly detector: DetectorKind;
  readonly params: { readonly [key: string]: number };
};

export type DetectResult = {
  readonly detector: DetectorKind;
  readonly matches: readonly number[];
  readonly scanned: number;
  readonly lastOffset: number;
  readonly truncated: boolean;
};
```

Also update the header comment so it lists `detection/runDetection.ts`.

`src/api/client.ts`:

```ts
export const detect = (id: string, request: DetectRequest): Promise<DetectResult> =>
  request(`/api/accounts/${enc(id)}/detect`, { method: "POST", body: JSON.stringify(request) });
```

The parameter name `request` shadows the module's `request<T>` function. Name the parameter `body` instead.

`src/commands/ManualCommand.tsx`: replace the inline `Math.round(x * 100) / 100` with `cents(x)` from `../money`.

- [ ] **Step 3: Run, expect pass.** Run `pnpm --filter playground-frontend test` and `pnpm --filter playground-frontend build`. Expected: clean.

- [ ] **Step 4: Gates.** Do not stage or commit.

---

### Task 4: Cursor + detection hook

**Files:**
- Modify: `apps/playground/frontend/src/useReplayCursor.ts`
- Create: `src/useDetection.ts`

**Interfaces:**
- Consumes: `centeredStart`, `MAX_PAGE_SIZE`, `stepMatch`, `buildDetectRequest`, `DETECTORS`, `detect()` client, and `MoveReason` with `"match"` (Task 3).
- Produces:
  - `ReplayCursor` gains `previous: ReplayItem | null` and `goToCentered: (offset: number) => void`.
  - `useDetection(accountId: string | null, lastOffset: number): Detection`, where:

```ts
type Detection = {
  readonly kind: DetectorKind;
  readonly setKind: (k: DetectorKind) => void;
  readonly inputs: { readonly [key: string]: string };
  readonly setInput: (key: string, value: string) => void;
  readonly matches: readonly number[];
  readonly index: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly truncated: boolean;
  readonly stale: boolean;
  readonly searched: boolean;
  readonly run: () => Promise<number | null>; // resolves to the first match offset, or null
  readonly step: (delta: 1 | -1) => number | null; // new current match offset, or null
};
```

- [ ] **Step 1: `useReplayCursor.ts` changes.** Make these edits on top of the v2 file:

(a) Fetch one item before the requested start, so the previous item for the ▲/▼ deltas is normally in the batch. Inside `load`, replace

```ts
const next = await replay(accountId, fetchOffset, pageSize, snapshots);
```

with

```ts
// One extra item before the page gives the ▲/▼ deltas their previous value.
const start = Math.max(0, fetchOffset - 1);
const size = Math.min(MAX_PAGE_SIZE, pageSize + (fetchOffset - start));
const next = await replay(accountId, start, size, snapshots);
```

The recorded `fetched` range stays the real range of `next.items`.

(b) Add `previous`:

```ts
const previous = current?.items.find((i) => i.offset === target - 1) ?? null;
```

Return it.

(c) Add `goToCentered`:

```ts
  /** Always fetches a page with `offset` in the middle (used for detection matches). */
  const goToCentered = useCallback(
    (offset: number) => {
      if (lastOffset < 0) return;
      const to = clampTarget(offset, lastOffset);
      void load(to, centeredStart(to, pageSize, lastOffset), "match");
    },
    [lastOffset, pageSize, load],
  );
```

Return it. Import `centeredStart` and `MAX_PAGE_SIZE` from `./replay/matchNav`.

Interaction with the extra item: a centred fetch of `start = centeredStart(...)` becomes `start − 1` with `pageSize + 1` items. The match stays at the same absolute position, and the page gains one item in front, so it is still centred within one item. That is acceptable, and the spec's "as close to the middle as bounds allow" covers it. Mention it in a code comment.

- [ ] **Step 2: `src/useDetection.ts`** (complete file):

```ts
import { useCallback, useState } from "react";
import { detect } from "./api/client";
import type { DetectorKind } from "./api/types";
import { buildDetectRequest, DETECTORS } from "./replay/detectors";
import { stepMatch } from "./replay/matchNav";

const initialInputs = (): { [key: string]: string } => {
  const out: { [key: string]: string } = {};
  for (const d of DETECTORS) for (const p of d.params) out[p.key] ??= p.initial;
  return out;
};

export type Detection = {
  readonly kind: DetectorKind;
  readonly setKind: (k: DetectorKind) => void;
  readonly inputs: { readonly [key: string]: string };
  readonly setInput: (key: string, value: string) => void;
  readonly matches: readonly number[];
  readonly index: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly truncated: boolean;
  readonly stale: boolean;
  readonly searched: boolean;
  readonly run: () => Promise<number | null>;
  readonly step: (delta: 1 | -1) => number | null;
};

/** Detector selection, server detection, and the current match. Results go stale when the head moves. */
export function useDetection(accountId: string | null, lastOffset: number): Detection {
  const [kind, setKindState] = useState<DetectorKind>("riskJump");
  const [inputs, setInputs] = useState<{ [key: string]: string }>(initialInputs);
  const [matches, setMatches] = useState<readonly number[]>([]);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [detectedAt, setDetectedAt] = useState<number | null>(null);

  const setKind = useCallback((k: DetectorKind) => {
    setKindState(k);
    setMatches([]);
    setIndex(0);
    setDetectedAt(null);
    setError(null);
  }, []);

  const setInput = useCallback((key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const run = useCallback(async (): Promise<number | null> => {
    if (accountId === null) return null;
    const built = buildDetectRequest(kind, inputs);
    if (!built.ok) {
      setError(built.error);
      return null;
    }
    setRunning(true);
    setError(null);
    try {
      const result = await detect(accountId, built.request);
      setMatches(result.matches);
      setIndex(0);
      setTruncated(result.truncated);
      setDetectedAt(lastOffset);
      return result.matches[0] ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setRunning(false);
    }
  }, [accountId, kind, inputs, lastOffset]);

  const step = useCallback(
    (delta: 1 | -1): number | null => {
      if (matches.length === 0) return null;
      const next = stepMatch(index, delta, matches.length);
      setIndex(next);
      return matches[next] ?? null;
    },
    [index, matches],
  );

  return {
    kind,
    setKind,
    inputs,
    setInput,
    matches,
    index,
    running,
    error,
    truncated,
    stale: detectedAt !== null && detectedAt !== lastOffset,
    searched: detectedAt !== null,
    run,
    step,
  };
}
```

If `??=` is not allowed by the frontend tsconfig target (ES2022 allows it), write `if (out[p.key] === undefined) out[p.key] = p.initial;`.

- [ ] **Step 3: Keep the build green.** The current `ReplayPane` does not use the new fields yet. Run `pnpm --filter playground-frontend build` and `test`. Expected: clean.

- [ ] **Step 4: Gates.** Do not stage or commit.

---

### Task 5: UI — widgets, payload card, detection card, markers, jump fix

**Files:**
- Create: `apps/playground/frontend/src/ui/Delta.tsx`, `src/replay/OffsetWidget.tsx`, `src/replay/StatsWidget.tsx`, `src/replay/PayloadCard.tsx`, `src/replay/DetectionCard.tsx`
- Modify: `src/replay/Timeline.tsx`, `src/replay/ReplayPane.tsx`, `src/App.tsx`, `src/styles.css`
- Delete: `src/replay/ReplayCard.tsx`

**Interfaces:**
- Consumes: `cursor.previous`, `cursor.goToCentered` and `useDetection` (Task 4); `deltaOf`, `DETECTORS`, `detectorDef` (Task 3); `RiskMeter`, `formatAmount`.

- [ ] **Step 1: `src/ui/Delta.tsx`**

```tsx
import { formatAmount } from "../format";
import { deltaOf } from "./delta";

/** ▲/▼ change versus the previous offset; renders nothing when there is no change or no previous. */
export function Delta({ current, previous }: { readonly current: number; readonly previous: number | null }) {
  const d = deltaOf(current, previous);
  if (d.sign === 0) return null;
  return (
    <span className={d.sign > 0 ? "delta up" : "delta down"}>
      {d.sign > 0 ? "▲" : "▼"}
      {formatAmount(d.abs, "")}
    </span>
  );
}
```

- [ ] **Step 2: Widgets**

`src/replay/OffsetWidget.tsx`:

```tsx
import type { PlaygroundViews } from "../api/types";
import { formatAmount } from "../format";
import { Delta } from "../ui/Delta";
import { RiskMeter } from "../ui/RiskMeter";

type Props = {
  readonly offset: number;
  readonly lastOffset: number;
  readonly views: PlaygroundViews;
  readonly previous: PlaygroundViews | null;
};

export function OffsetWidget({ offset, lastOffset, views, previous }: Props) {
  const deg = lastOffset > 0 ? (offset / lastOffset) * 360 : 360;
  return (
    <div className="card widget">
      <h3>offset</h3>
      <div className="row between" style={{ margin: 0 }}>
        <span className="row" style={{ margin: 0 }}>
          <span
            className="ring"
            style={{ background: `conic-gradient(var(--accent) ${deg}deg, rgb(255 255 255 / 0.1) 0)` }}
            aria-label={`offset ${offset} of ${lastOffset}`}
          >
            <span className="ring-inner">{offset}</span>
          </span>
          <span className="dim">of {lastOffset}</span>
        </span>
        <span className="big">
          {formatAmount(views.balance.amount, views.balance.currency)}{" "}
          <Delta current={views.balance.amount} previous={previous?.balance.amount ?? null} />
        </span>
      </div>
      <RiskMeter risk={views.risk} />
      {previous !== null && previous.risk !== views.risk && (
        <div className="dim small">
          risk <Delta current={views.risk} previous={previous.risk} /> vs previous
        </div>
      )}
    </div>
  );
}
```

`src/replay/StatsWidget.tsx`:

```tsx
import type { StatsState } from "../api/types";
import { Delta } from "../ui/Delta";

const TILES: ReadonlyArray<{ readonly key: keyof StatsState; readonly icon: string; readonly cls: string }> = [
  { key: "deposits", icon: "▲", cls: "tile-deposit" },
  { key: "withdrawals", icon: "▼", cls: "tile-withdraw" },
  { key: "denied", icon: "⛔", cls: "tile-denied" },
];

export function StatsWidget({ stats, previous }: { readonly stats: StatsState; readonly previous: StatsState | null }) {
  return (
    <div className="card widget">
      <h3>stats</h3>
      <div className="tiles">
        {TILES.map((t) => (
          <div key={t.key} className={`tile ${t.cls}`}>
            <span className="tile-icon">{t.icon}</span>
            <b>{stats[t.key]}</b>
            <span className="dim small">
              {t.key} <Delta current={stats[t.key]} previous={previous?.[t.key] ?? null} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

`src/replay/PayloadCard.tsx` replaces `ReplayCard`:

```tsx
import type { ReplayItem } from "../api/types";
import { formatAmount } from "../format";

export function PayloadCard({ item }: { readonly item: ReplayItem }) {
  const p = item.event_payload;
  return (
    <div className="card">
      <h3>event_payload</h3>
      <table className="kv">
        <tbody>
          <tr><td>type</td><td>{item.event_meta.eventType}</td></tr>
          <tr><td>description</td><td>{p.description}</td></tr>
          <tr><td>value</td><td>{formatAmount(p.value, p.currency)}</td></tr>
          {p.reason !== undefined && <tr><td>reason</td><td className="error">{p.reason}</td></tr>}
        </tbody>
      </table>
      <h3 style={{ marginTop: 10 }}>messages</h3>
      {item.messages.length === 0 ? (
        <span className="dim">(none)</span>
      ) : (
        item.messages.map((m, i) => (
          <span key={i} className="badge badge-server">
            📣 {m.messageType}
          </span>
        ))
      )}
      <details>
        <summary>raw JSON</summary>
        <pre>{JSON.stringify({ event_payload: p, messages: item.messages }, null, 2)}</pre>
      </details>
    </div>
  );
}
```

(The event type comes from `event_meta.eventType` in the DTO. The `event_meta` section is gone from the UI; only the type is shown, as a row of the payload table.)

- [ ] **Step 3: `src/replay/DetectionCard.tsx`**

```tsx
import type { DetectorKind } from "../api/types";
import type { Detection } from "../useDetection";
import { DETECTORS, detectorDef } from "./detectors";

function toKind(v: string): DetectorKind {
  return DETECTORS.find((d) => d.kind === v)?.kind ?? "riskJump";
}

type Props = { readonly detection: Detection; readonly onMatch: (offset: number) => void };

export function DetectionCard({ detection: d, onMatch }: Props) {
  const def = detectorDef(d.kind);
  const n = d.matches.length;
  const current = d.matches[d.index];
  const go = (offset: number | null) => {
    if (offset !== null) onMatch(offset);
  };
  return (
    <div className="card detect">
      <h3>detection</h3>
      <div className="row">
        <select value={d.kind} onChange={(e) => d.setKind(toKind(e.target.value))}>
          {DETECTORS.map((x) => (
            <option key={x.kind} value={x.kind}>
              {x.label}
            </option>
          ))}
        </select>
        {def.params.map((p) => (
          <label key={p.key}>
            {p.label}{" "}
            <input
              type="number"
              step="any"
              value={d.inputs[p.key] ?? ""}
              onChange={(e) => d.setInput(p.key, e.target.value)}
            />
          </label>
        ))}
        <button className="primary" disabled={d.running} onClick={() => void d.run().then(go)}>
          🔎 Detect
        </button>
      </div>
      <div className="row" style={{ margin: 0 }}>
        <button disabled={n === 0 || d.index <= 0} onClick={() => go(d.step(-1))}>
          ◀ prev
        </button>
        <span className="mono">
          {d.running
            ? "detecting…"
            : n > 0 && current !== undefined
              ? `match ${d.index + 1} / ${n} · offset ${current}`
              : d.searched
                ? "no matches"
                : "—"}
        </span>
        <button disabled={n === 0 || d.index >= n - 1} onClick={() => go(d.step(1))}>
          next ▶
        </button>
      </div>
      {d.truncated && <p className="dim small">results truncated (scan or match limit reached)</p>}
      {d.stale && <p className="warn small">results outdated — detect again</p>}
      {d.error !== null && <p className="error">{d.error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Timeline markers.** In `src/replay/Timeline.tsx`:
- Add the prop `readonly matches: ReadonlySet<number>`.
- Inside each bar button, render `{matches.has(e.offset) && <i className="match-mark" aria-hidden="true" />}`.
- Append `, match` to the bar's `aria-label` when it is matched.

- [ ] **Step 5: `src/replay/ReplayPane.tsx`.** Change the existing file as follows:
- Change the `jump` prop type to `{ readonly accountId: string; readonly offset: number; readonly nonce: number } | null`. In the jump effect, return early unless `jump.accountId === accountId`. This is the v2 bug fix.
- Call `const detection = useDetection(accountId, lastOffset);`, and build `const matchSet = useMemo(() => new Set(detection.matches), [detection.matches]);`.
- Remove the `slide-forward` / `slide-back` wrapper and the `ReplayCard` import.
- New render order, below the title row and source badge (which are unchanged):
  1. `<div className="widgets">`, containing:
     - `<OffsetWidget offset={cursor.item.offset} lastOffset={lastOffset} views={cursor.item.views} previous={cursor.previous?.views ?? null} />`
     - `<StatsWidget stats={cursor.item.views.stats} previous={cursor.previous?.views.stats ?? null} />`
     - When `cursor.item` is null, render `<p>{cursor.loading ? "Loading…" : "No data"}</p>` instead of the widgets and the payload card.
  2. `<PayloadCard item={cursor.item} />`.
  3. A navigation card, `<div className="card">` with `<h3>navigation</h3>`, containing the existing rows in this order: the offset/Go/snapshots/page-size row, the step buttons, the slider, `<Timeline … matches={matchSet} />`, the timeline error, the cursor error, and the debug cache line.
  4. `<DetectionCard detection={detection} onMatch={cursor.goToCentered} />`.
  5. `<NavLog moves={cursor.moves} />`.
- Keep: `isTypingTarget`, offset input sync, ←/→ keys, the Go guard, the page-size apply, the empty states, the snapshots checkbox.

- [ ] **Step 6: `src/App.tsx` jump fix.**
- Use state `useState<{ accountId: string; offset: number; nonce: number } | null>(null)`.
- In `requestJump(offset)`, read `selectedRef.current`. If it is null, do nothing. Otherwise set `{ accountId: selectedRef.current, offset, nonce: Date.now() }`.
- In the selection effect, also call `setJump(null)` when the selection changes.

- [ ] **Step 7: `src/styles.css`.**
- Delete the `.slide-forward`, `.slide-back` and `@keyframes slide-in-*` rules, and the `.slide-*` selector inside the reduced-motion block. Keep the reduced-motion block for the transitions.
- Append:

```css
.widgets { display: grid; grid-template-columns: 1.15fr 1fr; gap: var(--gap); margin-bottom: var(--gap); }
.widget { box-shadow: 0 14px 40px rgb(0 0 0 / 0.45); margin-bottom: 0; }
.ring { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.ring-inner { width: 50px; height: 50px; border-radius: 50%; background: var(--bg); display: grid; place-items: center; font-weight: 800; color: var(--heading); }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tile { border-radius: var(--radius-sm); padding: 8px; text-align: center; background: rgb(0 0 0 / 0.25); border: 1px solid var(--card-line); }
.tile b { display: block; font-size: 22px; color: var(--heading); }
.tile-deposit { border-color: hsl(150 70% 50% / 0.55); } .tile-deposit .tile-icon { color: var(--ok); }
.tile-withdraw { border-color: hsl(var(--hue) 85% 62% / 0.55); } .tile-withdraw .tile-icon { color: var(--accent); }
.tile-denied { border-color: hsl(355 80% 62% / 0.55); } .tile-denied .tile-icon { color: var(--danger); }
.delta { font-size: 12px; font-weight: 700; margin-left: 4px; }
.delta.up { color: var(--ok); } .delta.down { color: var(--danger); }
.small { font-size: 12px; }
.warn { color: #f5c542; }
table.kv { border-collapse: collapse; width: 100%; }
table.kv td { padding: 3px 6px; border-bottom: 1px solid var(--line); }
table.kv td:first-child { color: var(--dim); width: 110px; }
.card.detect { border: 1px dashed hsl(45 90% 60% / 0.6); }
.bar { position: relative; }
.match-mark { position: absolute; top: -9px; left: -2px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 7px solid #f5c542; pointer-events: none; }
.timeline { padding-top: 10px; }
@media (max-width: 900px) { .widgets { grid-template-columns: 1fr; } }
```

- [ ] **Step 8: Build + tests.** Run `pnpm --filter playground-frontend build`, `pnpm --filter playground-frontend test`, eslint and prettier. Expected: clean. Check that `ReplayCard.tsx` is deleted and that nothing imports it.

- [ ] **Step 9: Gates.** Do not stage or commit.

---

### Task 6: Deploy, docs, Definition of Done

**Files:**
- Modify: `apps/playground/README.md`

- [ ] **Step 1: README.**
- Add an API row: `POST /api/accounts/:id/detect` with `{ detector, params }`. List the 5 detectors with their params and ranges, the edge-triggered offsets in the response `{ detector, matches, scanned, lastOffset, truncated }`, and the 20,000-scan / 1,000-match limits.
- Add a "What to check" bullet: after Detect, the page is centred on the match (log shows `🎯 match → X fetched S–E`), and prev/next step through the matches.

- [ ] **Step 2: Deploy** (the context must be `docker-desktop`):

```bash
kubectl config current-context        # docker-desktop
pnpm playground:deploy                # "Playground ready: http://localhost:8080"
curl -fsS -XPOST localhost:8080/api/accounts/v3-check/generate -H 'content-type: application/json' -d '{"count":5,"pattern":"riskSpike"}'
curl -fsS -XPOST localhost:8080/api/accounts/v3-check/generate -H 'content-type: application/json' -d '{"count":20,"pattern":"riskCoolDown"}'
curl -fsS -XPOST localhost:8080/api/accounts/v3-check/detect -H 'content-type: application/json' -d '{"detector":"riskJump","params":{"jump":2.5}}'
curl -fsS -XPOST localhost:8080/api/accounts/v3-check/detect -H 'content-type: application/json' -d '{"detector":"riskDecline","params":{"percent":50,"window":5}}'
curl -s -o /dev/null -w '%{http_code}\n' -XPOST localhost:8080/api/accounts/v3-check/detect -H 'content-type: application/json' -d '{"detector":"riskJump","params":{"jump":0}}'
```

Expected:
- the first detect returns `"matches":[1]` and `"scanned":25`;
- the second returns a non-empty list;
- the last call prints `400`.

- [ ] **Step 3: Definition of Done.**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l        # 0
pnpm exec eslint . 2>&1 | grep -c " error "       # 0
pnpm lint
pnpm exec prettier --check "apps/playground/**/*.{ts,tsx}"
pnpm --filter playground-frontend build
pnpm --filter playground-frontend test
pnpm --filter playground-backend test
pnpm test
```

Paste the real output lines, with their counts, into the report.

- [ ] **Step 4: Manual checklist.** Mark each item "verified" with evidence, or "not verified (no browser)":
- No slide animation.
- The widgets show ▲/▼ after a step.
- Detect jumps to a centred page.
- Prev/next move between matches.
- The timeline shows amber ▼ marks.
- A "▶ view" jump does not follow you to another account.

Leave the playground running. Do not stage or commit.
