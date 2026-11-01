# View Snapshot Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let clients choose, per view, when a view snapshot is stored, through a typed fluent callback on `withView`.

**Architecture:** A new `EvDbSnapshotStrategyBuilder` collects rules and compiles them into an `EvDbSnapshotStrategy`. `withView` runs the client callback and puts the compiled strategy on `ViewConfig`. `EvDbViewRaw` gains the event flag and the `storedAt` update; `GenericView` asks the strategy.

**Tech Stack:** TypeScript (ESM, NodeNext), `node:test`, pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-10-29-view-snapshot-strategy-design.md`

## Global Constraints

- Relative imports end in `.js`. Type-only imports use `import type`.
- No `any`. No new `as unknown as` casts except the one approved in Task 2, Step 3.
- No change to `packages/types/src/view/IEvDbViewStore.ts`.
- Default (no rules) keeps today's behavior: store on every save.
- Tests use `node:test` with Given/When/Then names, next to the code.
- Health check: `pnpm build 2>&1 | grep "error TS" | wc -l` and `pnpm exec eslint . 2>&1 | grep -c " error "` must not go up.

## Review Focus

1. Stream loaded with `factory.get()`: catch-up events do not run `onEvent`, so a stored matching event does not trigger a snapshot on the next `store()`. Test in Task 3.
2. `storeSnapshotAsync` throws: flag stays `true`, `storeOffset` and `storedAt` unchanged, next `store()` retries. Test in Task 2.
3. Strategy with only `onEvent` rules and no matching event: never stores (no fallback to "always"). Test in Task 2.
4. Callback that adds no rules: same as no callback, stores every save. Test in Task 1.
5. Event the view skips by offset (already applied): predicate does not run. Test in Task 2.

---

### Task 1: Strategy builder and compiled strategy

**Files:**
- Create: `packages/core/src/view/EvDbSnapshotStrategyBuilder.ts`
- Test: `packages/core/src/view/EvDbSnapshotStrategyBuilder.test.ts`

**Interfaces:**
- Produces:
  - `export interface EvDbSnapshotContext { readonly offsetGap: number; readonly durationGapMs: number }`
  - `export interface EvDbSnapshotStrategyBuilder<TState, TEventMap extends Record<string, object>>` with `when`, both `onEvent` overloads (exact shape in spec), `offsetGap`, `durationGapMs`, each returning `this`
  - `export interface EvDbSnapshotStrategy<TState> { readonly hasRules: boolean; shouldStore(ctx: EvDbSnapshotContext): boolean; matchesEvent(state: TState, event: IEvDbPayloadData, metadata: IEvDbEventMetadata): boolean }` (untyped runtime boundary; the builder's wrappers do the casts, guarded by the `eventType` check for the typed overload. These casts replace the one approved for `GenericView`; `GenericView` needs none)
  - `export type EvDbSnapshotStrategyConfigure<TState, TEventMap extends Record<string, object>> = (snapshot: EvDbSnapshotStrategyBuilder<TState, TEventMap>) => EvDbSnapshotStrategyBuilder<TState, TEventMap> | void`
  - `export function createSnapshotStrategy<TState, TEventMap extends Record<string, object>>(configure: EvDbSnapshotStrategyConfigure<TState, TEventMap>): EvDbSnapshotStrategy<TState>`

- [ ] **Step 1: Write the failing tests**

Type map for tests: `type Events = { Added: { points: number }; Closed: { reason: string } }`, state `number`.

- `Given no rules When shouldStore Then true for any context` (`hasRules === false`; callback `() => {}`).
- `Given offsetGap(50) When gap 49 / 50 Then false / true`.
- `Given durationGapMs(300_000) When 299_999 / 300_000 Then false / true`.
- `Given offsetGap(50) and durationGapMs(300_000) When either matches Then true` (OR).
- `Given when(ctx => ctx.offsetGap === 3) When gap 3 Then true`.
- `Given only onEvent rules When shouldStore Then false` (`hasRules === true`).
- `Given two onEvent rules When one matches Then matchesEvent true`.
- `Given offsetGap(-1) / offsetGap(NaN) / durationGapMs(-1) Then throws RangeError`.
- `Given statement-style callback (no return) Then rules are kept`.
- `Given onEvent("Closed") When metadata.eventType is "Added" / "Closed" Then false / true`.
- `Given onEvent("Added", (_s, e) => e.points > 10) When Added 5 / Added 20 / Closed Then false / true / false` (predicate not called for Closed).
- `Given onEvent((s) => s > 3) (one-param predicate) Then compiles and matches on state`.
- Type-level: `onEvent("Added", (_s, e) => e.points > 0)` compiles; `// @ts-expect-error` on `onEvent("Nope")`; `// @ts-expect-error` on `onEvent("Closed", (_s, e) => e.points > 1)`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test packages/core/src/view/EvDbSnapshotStrategyBuilder.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `EvDbSnapshotStrategyBuilder.ts`**

A private class implements the builder interface and holds two arrays: context rules and event rules. `offsetGap(n)` and `durationGapMs(ms)` validate (`Number.isNaN(v) || v < 0` throws `RangeError`) and push a context rule (`>=`). `createSnapshotStrategy` creates the class, calls `configure`, ignores the return value, and returns the compiled strategy. `shouldStore` returns `true` when there are no rules at all, else OR over context rules. Do not expose the class.

- [ ] **Step 4: Run to verify they pass**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/view/EvDbSnapshotStrategyBuilder.ts packages/core/src/view/EvDbSnapshotStrategyBuilder.test.ts
git commit -m "feat(core): add view snapshot strategy builder"
```

---

### Task 2: View runtime uses the strategy

**Files:**
- Modify: `packages/core/src/view/EvDbViewRaw.ts:36-57`
- Modify: `packages/core/src/factories/EvDbViewFactoryTypes.ts` (`ViewConfig`)
- Modify: `packages/core/src/factories/EvDbViewFactory.ts` (`GenericView`)
- Test: `packages/core/src/view/EvDbView.snapshotStrategy.test.ts`

**Interfaces:**
- Consumes: `EvDbSnapshotStrategy`, `createSnapshotStrategy` from Task 1.
- Produces:
  - `ViewConfig.snapshotStrategy?: EvDbSnapshotStrategy<TState, TEventMap>`
  - `EvDbViewRaw`: `protected matchesSnapshotEvent(e: EvDbEvent): boolean` (default `false`), called in `applyEvent` after `onApplyEvent` and the `_memoryOffset` update.
  - `EvDbViewRaw.applyEvent(e: EvDbEvent, evaluateSnapshotRules = true): void`. `false` skips `matchesSnapshotEvent`. `IEvDbViewStore` stays unchanged (an extra optional parameter is compatible).
- Modify: `packages/core/src/factories/EvDbStreamFactory.ts:385` — catch-up loop in `get()` calls `view.applyEvent(event, false)`.

- [ ] **Step 1: Write the failing tests**

Build views with `createViewFactory` and a test adapter that extends `InMemoryStorageAdapter` and records stored offsets (plus a `failNext` switch that makes `storeSnapshotAsync` throw once). Apply events through `view.applyEvent(...)` and call `view.store()`. Use `mock.timers.enable({ apis: ["Date"] })` for time.

- `Given no strategy When store after each event Then every store writes` (regression).
- `Given offsetGap(3) When 2 events then store Then nothing; When 3rd event then store Then one snapshot at offset 3`.
- `Given durationGapMs(1000) When store at +999ms Then nothing; at +1000ms Then stored; then at +1500ms Then nothing` (proves `storedAt` updated).
- `Given onEvent matching "Closed" When Added, store Then nothing; When Closed, store Then stored; When Added, store Then nothing` (flag reset).
- `Given onEvent predicate When it sees state Then state includes the event` (assert inside predicate).
- `Given onEvent match and adapter throws once When store Then rejects, storeOffset unchanged; When store again Then stored` (Review Focus 2).
- `Given only onEvent rules and no match When many stores Then nothing stored` (Review Focus 3).
- `Given onEvent predicate When same event applied twice Then predicate called once` (Review Focus 5).
- `Given onEvent match When applyEvent(e, false) Then predicate not called and store writes nothing`.
- `Given predicate throws When applyEvent Then throws`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test packages/core/src/view/EvDbView.snapshotStrategy.test.ts`
Expected: FAIL (strategy ignored).

- [ ] **Step 3: Implement**

`EvDbViewRaw`:
- Private `_snapshotRequested = false`. In `applyEvent`, after the offset update, `if (evaluateSnapshotRules && !this._snapshotRequested && this.matchesSnapshotEvent(e)) this._snapshotRequested = true`.
- `EvDbStreamFactory.get()` catch-up loop: pass `false`.
- `store()`: store when `this._snapshotRequested || this.shouldStoreSnapshot(gap, ms)`. After `storeSnapshotAsync` resolves: set `_storeOffset`, `_storedAt = new Date()`, `_snapshotRequested = false`. Rename `secondsSinceLatestSnapshot` to `msSinceLatestSnapshot`.

`GenericView`:
- Override `shouldStoreSnapshot(gap, ms)`: no strategy returns `true`, else `strategy.shouldStore({ offsetGap: gap, durationGapMs: ms })`.
- Override `matchesSnapshotEvent(e)`: no strategy returns `false`, else `strategy.matchesEvent(this.state, e.payload, e)`.
  `matchesEvent` takes the untyped runtime event, so no cast is needed here (Task 1 owns the guarded casts).

- [ ] **Step 4: Run to verify they pass**

Run: same as Step 2, plus `node --import tsx --test 'packages/core/src/**/*.test.ts'`. Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/view packages/core/src/factories/EvDbViewFactory.ts packages/core/src/factories/EvDbViewFactoryTypes.ts packages/core/src/factories/EvDbStreamFactory.ts
git commit -m "feat(core): views honor snapshot strategy, track storedAt"
```

---

### Task 3: `withView` accepts the strategy callback

**Files:**
- Modify: `packages/core/src/factories/StreamFactoryBuilder.ts:82-100`
- Test: `packages/core/src/factories/StreamFactoryBuilder.snapshotStrategy.test.ts`

**Interfaces:**
- Consumes: `EvDbSnapshotStrategyConfigure`, `createSnapshotStrategy` (Task 1), `ViewConfig.snapshotStrategy` (Task 2).
- Produces: `withView(viewName, defaultState, handlers, snapshot?: EvDbSnapshotStrategyConfigure<TState, TEventMap>)`, same return type as today.

- [ ] **Step 1: Write the failing tests**

End to end through `new StreamFactoryBuilder(...).withEvent(...).asType<...>().withView(..., (s) => s.offsetGap(2)).build()`, `factory.create(id, adapter, adapter)`, `appendEvent...`, `store()`.

- `Given two views, one with offsetGap(2) and one without When store after 1 event Then only the default view stored`.
- `Given onEvent((_s, _e, m) => m.streamCursor.offset === 1) When first event stored Then snapshot at offset 1; When second stored Then none`.
- `Given offsetGap(-1) When withView runs Then throws RangeError`.
- `Given a stored stream whose events include a match and offsetGap(100) When factory.get() then store() with one new non-matching event Then no snapshot` (Review Focus 1).
- Type-level: the spec's `Balance` / `Risk` sample compiles unchanged.

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test packages/core/src/factories/StreamFactoryBuilder.snapshotStrategy.test.ts`
Expected: FAIL (4th argument not accepted).

- [ ] **Step 3: Implement**

Add the optional 4th parameter typed with `TState` and `TEventMap` from the builder. When given, call `createSnapshotStrategy(snapshot)` and pass it as `snapshotStrategy` in the `createViewFactory` config. Update the `withView` JSDoc with a short example.

- [ ] **Step 4: Run to verify they pass**

Run: same as Step 2, then `pnpm build` and `pnpm exec eslint .`. Expected: PASS; counts not above baseline. Confirm `enforce-stream-factory-module` accepts a factory module that uses the callback (add the `Risk` view to a lint fixture or run eslint on a scratch factory file).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/factories/StreamFactoryBuilder.ts packages/core/src/factories/StreamFactoryBuilder.snapshotStrategy.test.ts
git commit -m "feat(core): withView accepts a snapshot strategy"
```

---

### Task 4: Docs, ADR, changeset

**Files:**
- Modify: `packages/core/README.md` (views section: add "Snapshot strategy" with the spec sample and the rules list)
- Modify: `docs/concepts.md` (one paragraph: snapshots are per view, strategy controls when)
- Create: `docs/guides/snapshots.md` (full guide: API, OR rule, flag, `storedAt`, first-event recipe, not a timer)
- Modify: `docs/README.md`, `llms.txt` (link the new guide)
- Create: `docs/adr/0003-per-view-snapshot-strategy.md` (decision: scoped fluent callback over positional modifiers and options object; OR semantics; flag reset on success)
- Create: `.changeset/view-snapshot-strategy.md` (`@eventualize/core`: minor)
- Modify: `AGENTS.md` "Docs to update" table: row "View snapshot strategy → docs/guides/snapshots.md"

- [ ] **Step 1: Write the docs and changeset**
- [ ] **Step 2: Verify**

Run: `pnpm build && pnpm exec eslint . && pnpm lint && pnpm test`
Expected: all green (needs Docker for `pnpm test`; rule out environment issues before treating failures as bugs).

- [ ] **Step 3: Commit**

```bash
git add packages/core/README.md docs AGENTS.md llms.txt .changeset/view-snapshot-strategy.md
git commit -m "docs: view snapshot strategy guide, ADR, changeset"
```
