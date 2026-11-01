# Snapshot Pointer Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `store()` moves each view's snapshot offset forward with a small pointer row when the view state did not change, and writes the full state only when it may have changed. The view state becomes `DeepReadonly`, and there are two change-detection modes, `"always"` (the default) and `"trusted"`.

**Architecture:** One new table, `snapshot_v2` (SQL and DynamoDB). Each row is either a full row (`state` set, `state_offset` = its own offset) or a pointer row (`state` NULL, `state_offset` = the offset of a full row, or NULL for "default state"). Adapters resolve a pointer when they read. The view tracks a dirty flag and the reference to its last full row, and picks pointer, full, or nothing on each `store()`.

**Tech Stack:** TypeScript (ESM, NodeNext), pnpm monorepo, `node:test`, Prisma 7.10.1 (Postgres, MySQL), AWS SDK v3 DynamoDB (LocalStack), Testcontainers.

**Spec:** `docs/superpowers/specs/2026-11-01-snapshot-pointer-row-design.md`

**Deviation from the spec (owner to confirm):** the spec sketches the SQL read as one statement with a self `LEFT JOIN`. This plan reads a pointer row with two Prisma queries: `findFirst` for the latest row, then `findUnique` for the full row it names. The reason: the relational query class is shared by Postgres and MySQL, and raw SQL needs a different identifier quote per dialect (`"offset"` vs `` `offset` ``). Two queries are still consistent, because the full row a pointer names is immutable and was written before the pointer. The cost is a second round trip on SQL for pointer reads, the same as on DynamoDB.

## Global Constraints

- Use `pnpm` only. Run commands from the repo root.
- Health check before and after each task: `pnpm build 2>&1 | grep "error TS" | wc -l` and `pnpm exec eslint . 2>&1 | grep -c " error "`. Neither count may go up.
- ESM with NodeNext: relative imports end in `.js`. Use `import type` for type-only imports. Unused names start with `_`.
- No `index.ts` barrels. Consumers deep-import through `exports` wildcards.
- Tests sit next to the code (`Name.<feature>.test.ts`), use `node:test` with Given/When/Then names. Integration tests live in `apps/sample-app/src/tests/` and end in `integration.test.ts`.
- Type-safe code: no new `any`, no untyped casts. Keep `unknown` only where the existing raw snapshot types already use it (`state: unknown`).
- New table name is exactly `snapshot_v2`, on Postgres, MySQL, and DynamoDB. Do not change or drop the old `snapshot` / `snapshots` tables or models.
- `state_offset` encoding: full row = its own `offset`; pointer row = offset of a full row; default-state pointer = NULL. A pointer never names another pointer.
- Change detection: `"always"` is the default; `"trusted"` is opt-in. No `hash` mode. No runtime freeze.
- Prisma is pinned to `7.10.1`. Do not edit `**/generated/`; regenerate it with `prisma generate` in `postgres-storage-adapter` and `mysql-storage-adapter`.
- Workspace packages resolve from `dist/`: run `pnpm build` before running tests in another package.
- DynamoDB GetItem of the full row behind a pointer uses `ConsistentRead: true`. Never use a GSI for this read.

## Review Focus

1. **A view whose state is `null`, `0`, `""` or `false`.** A full row with such a state must load as that state, not as a pointer or as the default state. Covered in Task 2 and Task 3 adapter tests (full row with state `null`) and in Task 4 (view with `defaultState` `0`).
2. **`get(maxOffset)` between a full row and its pointer, and below the first row.** It must return the latest row at or before `maxOffset`, resolved, or the empty snapshot. Covered in Task 2 and Task 3 adapter tests.
3. **The snapshot write throws.** `storeOffset`, `stateRef` and the dirty flag must not move, and the next `store()` must write the right row kind. Covered in Task 4.
4. **Events applied while a snapshot write is in flight.** The dirty flag must stay set, so the next `store()` does not write a pointer over a changed state. Covered in Task 4.
5. **A new SDK with an empty `snapshot_v2` while the old table still holds snapshots.** Load must replay from the default state with no error, and must not read the old table. Covered in Task 4 integration test.

---

### Task 1: Snapshot types carry row kind and state reference

Keeps every existing behaviour: core still writes only full rows, and adapters still use the old tables. This task changes the types and updates every implementer so the build stays green.

**Files:**
- Create: `packages/types/src/snapshots/EvDbStateRef.ts`
- Create: `packages/types/src/snapshots/EvDbSnapshotBody.ts`
- Modify: `packages/types/src/snapshots/EvDbStoredSnapshotData.ts`
- Modify: `packages/types/src/snapshots/EvDbStoredSnapshotResultRaw.ts`
- Modify: `packages/types/src/snapshots/EvDbStoredSnapshotResult.ts`
- Modify: `packages/types/src/view/IEvDbViewStore.ts` (only if its `getSnapshotData` type needs it)
- Modify (mechanical, keep behaviour): `packages/core/src/view/EvDbView.ts`, `packages/core/src/factories/EvDbViewFactory.ts`, `packages/core/src/store/EvDbEmptySnapshotAdapter.ts`, `packages/core/src/store/InMemoryStorageAdapter.test-support.ts`, `packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`, `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`, `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapterQueries.ts`, `apps/sample-app/src/tests/StorageAdapterStub.ts`, `apps/e2e/funds/src/tests/StorageAdapterStub.ts`, `apps/playground/backend/src/tests/InMemoryStorageAdapter.ts`, and every test that builds `EvDbStoredSnapshotData` or reads `.state` from it (`grep -rl "EvDbStoredSnapshotData\|storeSnapshotAsync" packages apps`).
- Test: `packages/types/src/snapshots/EvDbStoredSnapshotData.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  // EvDbStateRef.ts
  export type EvDbStateRef =
    | { readonly kind: "row"; readonly offset: number } // a full row at this offset
    | { readonly kind: "default" };                     // the view's defaultState

  // EvDbSnapshotBody.ts
  export type EvDbSnapshotBody =
    | { readonly kind: "full"; readonly state: unknown }
    | { readonly kind: "pointer"; readonly stateRef: EvDbStateRef };
  ```
  - `EvDbStoredSnapshotData`: field `readonly state: unknown` is replaced by `readonly body: EvDbSnapshotBody`. Constructor: `(id, streamType, streamId, viewName, offset, storeOffset, body)`. `fromAddress(address, offset, storeOffset, body)`.
  - `EvDbStoredSnapshotResultRaw`: constructor `(offset, storedAt, state, stateRef: EvDbStateRef)`, field `readonly stateRef: EvDbStateRef`. `Empty` has `stateRef: { kind: "default" }`.
  - `EvDbStoredSnapshotResult<TState>`: same 4th parameter and field. `getEmptyState()` uses `{ kind: "default" }`.
  - A full row read back has `stateRef: { kind: "row", offset: <its own offset> }`.

- [ ] **Step 1: Record the health-check baseline** (both counts from Global Constraints).

- [ ] **Step 2: Write the failing test** `EvDbStoredSnapshotData.test.ts`:
  - `Given a full body, When fromAddress is called, Then body.kind is "full" and body.state is the state` (assert `deepStrictEqual(data.body, { kind: "full", state: { sum: 3 } })`).
  - `Given a pointer body to row 5, When fromAddress is called, Then body is { kind: "pointer", stateRef: { kind: "row", offset: 5 } }`.
  - `Given EvDbStoredSnapshotResultRaw.Empty, Then stateRef is { kind: "default" } and offset is -1`.

- [ ] **Step 3: Run it and see it fail.** Run: `node --import tsx --test packages/types/src/snapshots/EvDbStoredSnapshotData.test.ts`. Expected: FAIL (`body` / `stateRef` missing).

- [ ] **Step 4: Implement the types**, then update every implementer mechanically. Writers build `{ kind: "full", state }`. Readers of an existing full row return `stateRef: { kind: "row", offset }`. An adapter given a `pointer` body throws `new Error("pointer snapshot rows are not supported by this adapter yet")` until Tasks 2 and 3 replace it. The in-memory test-support adapter and the app stubs store the body as is and return `stateRef` from it, so Task 4 can use them for pointers.

- [ ] **Step 5: Run the test, then `pnpm build` and `pnpm test:unit`.** Expected: PASS. Build and lint counts not higher than the baseline.

- [ ] **Step 6: Commit** `feat(types): snapshot body and state reference types`.

---

### Task 2: SQL adapters read and write `snapshot_v2`

**Files:**
- Modify: `packages/adapters/postgres-storage-adapter/prisma/schema.prisma`, `packages/adapters/mysql-storage-adapter/prisma/schema.prisma` (add model; keep `snapshot`)
- Create: `packages/adapters/postgres-storage-adapter/prisma/migrations/20261101000000_add_snapshot_v2/migration.sql`
- Create: `packages/adapters/mysql-storage-adapter/prisma/migrations/20261101000000_add_snapshot_v2/migration.sql`
- Regenerate: `packages/adapters/relational-storage-adapter/src/generated/prisma` (from Postgres schema), `packages/adapters/mysql-storage-adapter/src/generated/prisma`
- Modify: `packages/adapters/relational-storage-adapter/src/EvDbRelationalStorageAdapterQueries.ts:107-142`
- Modify: `packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts:310-349`
- Modify: `packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdmin.ts` (also clear `snapshot_v2`)
- Modify: `apps/sample-app/src/tests/TestContainerManager/postgresql-setup.ts`, `mysql-setup.ts` (create `snapshot_v2`)
- Test: `apps/sample-app/src/tests/snapshotV2.adapter.integration.test.ts` (create; loop over the databases the way `integration.test.ts` does)

**Interfaces:**
- Consumes: `EvDbSnapshotBody`, `EvDbStateRef`, result constructors from Task 1.
- Produces: Prisma model `snapshot_v2`; `getSnapshotAsync` resolves pointers; `storeSnapshotAsync` writes both kinds.

Model (Postgres; MySQL uses the same columns with its existing types: `id @db.Char(36)`, `stored_at @db.DateTime(6)`, `state Json?`):

```prisma
model snapshot_v2 {
  id           String   @db.Uuid
  stream_type  String   @db.VarChar(150)
  stream_id    String   @db.VarChar(150)
  view_name    String   @db.VarChar(150)
  offset       BigInt
  state        Json?    @db.Json
  state_offset BigInt?
  stored_at    DateTime @default(now()) @db.Timestamptz(6)

  @@id([stream_type, stream_id, view_name, offset])
  @@index([stream_type, stream_id, view_name, stored_at], map: "ix_snapshot_v2_stored_at")
}
```

- [ ] **Step 1: Write the failing integration tests**, for Postgres and MySQL (Task 3 adds DynamoDB to the same file). Each writes rows with `storeSnapshotAsync` directly:
  - `Given a full row at 5 and a pointer at 8 to row 5, When getSnapshotAsync, Then offset is 8, state is the row-5 state, stateRef is { kind: "row", offset: 5 }`.
  - `Given the same rows, When getSnapshotAsync with maxOffset 6, Then offset is 5 and stateRef is { kind: "row", offset: 5 }`.
  - `Given only a full row at 5, When getSnapshotAsync with maxOffset 4, Then the result is Empty (offset -1)`.
  - `Given a default pointer at 3, When getSnapshotAsync, Then offset is 3, state is undefined, stateRef is { kind: "default" }`.
  - `Given a full row at 10 whose state is null, When getSnapshotAsync, Then state is null and stateRef is { kind: "row", offset: 10 }`.
  - `Given a full row in the old snapshot table only, When getSnapshotAsync, Then the result is Empty`.

- [ ] **Step 2: Run and see them fail.** Run: `TEST_CONTAINER=true TEST_DATABASES=Postgres pnpm exec dotenv -e .env.test -- node --import tsx --test apps/sample-app/src/tests/snapshotV2.adapter.integration.test.ts`. Expected: FAIL (pointer write throws, or the table does not exist).

- [ ] **Step 3: Add the model, the hand-written migrations (`CREATE TABLE snapshot_v2` + index, matching the model), and the test-container `CREATE TABLE IF NOT EXISTS snapshot_v2`.** Then run `pnpm --filter "./packages/adapters/postgres-storage-adapter" exec prisma generate` and the same for `mysql-storage-adapter`.

- [ ] **Step 4: Implement the queries and the adapter.**
  - Queries: `getSnapshot(streamType, streamId, viewName, maxOffset?)` reads `snapshot_v2` and also selects `state_offset`. New `getSnapshotState(streamType, streamId, viewName, offset: number)` is `findUnique` on the composite key and selects `state` only. `saveSnapshot(data: Prisma.snapshot_v2CreateInput)`.
  - Write mapping: full → `state` = the state (use `Prisma.JsonNull` when the state is `null`), `state_offset` = `offset`. Row pointer → `state` omitted, `state_offset` = `stateRef.offset`. Default pointer → both omitted.
  - Read mapping: `state_offset` NULL → `(offset, stored_at, undefined, { kind: "default" })`. `state_offset === offset` → full row. Otherwise call `getSnapshotState` for `state_offset`, and return the pointer's `offset` and `stored_at` with that state and `{ kind: "row", offset: state_offset }`. If that row is missing, throw an `Error` that names the view address and both offsets.
  - Admin clears `snapshot_v2` as well.

- [ ] **Step 5: Run the test file for Postgres and for MySQL** (`TEST_DATABASES=MySQL`). Expected: PASS. Then `pnpm build`; counts not higher.

- [ ] **Step 6: Commit** `feat(relational): snapshot_v2 table with pointer rows`.

---

### Task 3: DynamoDB adapter reads and writes `snapshot_v2`

**Files:**
- Create: `packages/adapters/dynamodb-storage-adapter/models/snapshot_v2-table-schema.json` (same keys and billing as `snapshots-table-schema.json`, `TableName: "snapshot_v2"`)
- Modify: `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapterQueries.ts:187-240`
- Modify: `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts:250-285`
- Modify: `packages/adapters/dynamodb-storage-adapter/src/EvDBDynamoDBAdmin.ts` (key extraction, projection and clear for `snapshot_v2`)
- Modify: `apps/sample-app/src/tests/TestContainerManager/dynamodb-setup.ts` (create `snapshot_v2`)
- Test: `apps/sample-app/src/tests/snapshotV2.adapter.integration.test.ts` (enable DynamoDB for the Task 2 cases)

**Interfaces:**
- Consumes: Task 1 types. Same behaviour contract as Task 2.
- Produces: `QueryProvider.getSnapshot` reads `snapshot_v2` and projects `state_offset`. New `QueryProvider.getSnapshotState(viewAddress, offset: number): GetItemCommand` with `ConsistentRead: true`, projecting `state`. `QueryProvider.saveSnapshot` writes both kinds.

- [ ] **Step 1: Turn on DynamoDB for the Task 2 test cases.**
- [ ] **Step 2: Run them and see them fail.** Run with `TEST_DATABASES=DynamoDB`. Expected: FAIL.
- [ ] **Step 3: Implement.** Item attributes: full → `state` (the existing `{ __state }` map) and `state_offset` = `offset`. Row pointer → no `state`, `state_offset` = target. Default pointer → neither. Read mapping and the missing-row error are the same as Task 2. Keep the existing conditional put.
- [ ] **Step 4: Run with `TEST_DATABASES=DynamoDB`, then `pnpm build`.** Expected: PASS; counts not higher.
- [ ] **Step 5: Commit** `feat(dynamodb): snapshot_v2 table with pointer rows`.

---

### Task 4: Views write pointer, full, or nothing

**Files:**
- Modify: `packages/core/src/view/EvDbViewRaw.ts` (dirty flag, `stateRef`, new `store()` algorithm)
- Modify: `packages/core/src/view/EvDbView.ts` (`onApplyEvent` returns a boolean; default state on a default ref)
- Modify: `packages/core/src/factories/EvDbViewFactory.ts` (`GenericView.onApplyEvent`: no handler → no change)
- Test: `packages/core/src/view/EvDbView.pointerRows.test.ts` (create; reuse the `RecordingAdapter` pattern from `EvDbView.snapshotStrategy.test.ts`)
- Test: `apps/sample-app/src/tests/snapshotPointer.integration.test.ts` (create) + a test factory under `apps/sample-app/src/tests/factories/`

**Interfaces:**
- Consumes: Task 1 types; Task 2/3 adapters.
- Produces:
  - `EvDbViewRaw`: `protected abstract onApplyEvent(e: EvDbEvent): boolean`, where `true` means "the state may have changed". New getter `get stateRef(): EvDbStateRef`. It starts from `snapshot.stateRef`. The dirty flag starts `false`.
  - `EvDbView.onApplyEvent` applies `handleOnApply` and returns `true`. A custom subclass is then safe by default.
  - `GenericView.onApplyEvent` returns `false` without calling anything when the event type has no handler. Otherwise it applies the handler and returns `true`. Task 5 adds the mode.
  - `EvDbView` constructor: the state is `defaultState` when `snapshot.offset < 0` or `snapshot.stateRef.kind === "default"`.

`store()` algorithm. The rules for when a write happens are fixed by the spec:

```
if memoryOffset <= storeOffset: return                       // no new events since the last row
snapshotOffset = memoryOffset                                // capture before await
if not dirty:
    write pointer { stateRef }                               // also satisfies a pending snapshot request
elif snapshotRequested or shouldStoreSnapshot(gap, ms):
    write full { state }; newRef = { kind: "row", offset: snapshotOffset }
else:
    return                                                    // changed but not due: write nothing
after a successful await:
    storeOffset = snapshotOffset; storedAt = now
    if full: stateRef = newRef
    if memoryOffset === snapshotOffset: snapshotRequested = false; if full: dirty = false
```

- [ ] **Step 1: Write the failing unit tests** in `EvDbView.pointerRows.test.ts`:
  - `Given a view with a handler only for Closed, When three Added events are stored one by one, Then each store writes a pointer row whose stateRef is { kind: "default" }`.
  - `Given a stored Added event (handler ran, no strategy), When store, Then a full row is written and stateRef becomes { kind: "row", offset: that offset }`.
  - `Given a full row at 2, When an event with no handler is stored at 3, Then a pointer row to row 2 is written at offset 3`.
  - `Given a strategy offsetGap(5) and a handler that ran, When store at gap 1, Then nothing is written and storeOffset does not move`.
  - `Given a dirty view, When the adapter throws on store, Then storeOffset, stateRef and dirty do not change, and the next store writes a full row` (Review Focus 3).
  - `Given a full write in flight, When an event with a handler is applied before it resolves, Then the next store writes a full row, not a pointer` (Review Focus 4).
  - `Given a snapshot result with stateRef default and offset 4, When the view is built, Then state equals defaultState and stateRef is default`.
  - `Given defaultState 0 and a stored full row with state 0, When the view loads and stores a no-handler event, Then the pointer names the full row` (Review Focus 1).

- [ ] **Step 2: Run them and see them fail.** Run: `node --import tsx --test packages/core/src/view/EvDbView.pointerRows.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the interfaces and the algorithm above. Pointer data is built in `EvDbViewRaw` with `EvDbStoredSnapshotData.fromAddress(address, snapshotOffset, storeOffset, { kind: "pointer", stateRef })`. Full data still comes from `getSnapshotData()`.

- [ ] **Step 4: Run the new tests and all core tests.** Run: `node --import tsx --test 'packages/core/src/**/*.test.ts'`. Expected: PASS. Fix any existing test whose expected snapshot writes change because a full write became a pointer. Change those expectations only where this spec says so.

- [ ] **Step 5: Write the integration test** `snapshotPointer.integration.test.ts`, for all three databases. The test factory has views `Rare` (handlers for `Started` and `Ended` only, strategy `onEvent("Ended")`) and `Count` (a handler for every event, no strategy).
  - `Given 20 Ticked events stored one per store, When the latest Rare row is read, Then its offset is the stream's last offset and its stateRef names the full row at Started`.
  - `Given that stream, When factory.get(), Then both views equal the views of a fresh full replay`.
  - `Given rows only in the old snapshot table, When factory.get(), Then views equal a full replay and no error is thrown` (Review Focus 5).

- [ ] **Step 6: Run it** (`pnpm test:postgres`, `pnpm test:mysql`, `pnpm test:dynamodb`). Expected: PASS. `pnpm build`; counts not higher.

- [ ] **Step 7: Commit** `feat(core): pointer snapshot rows when view state is unchanged`.

---

### Task 5: Change-detection modes

**Files:**
- Modify: `packages/core/src/view/EvDbSnapshotStrategyBuilder.ts`
- Modify: `packages/core/src/factories/EvDbViewFactory.ts` (`GenericView.onApplyEvent` uses the mode)
- Test: `packages/core/src/view/EvDbView.changeDetection.test.ts` (create)

**Interfaces:**
- Produces:
  - `export type EvDbChangeDetection = "always" | "trusted";` in `EvDbSnapshotStrategyBuilder.ts`.
  - `EvDbSnapshotStrategyBuilder.changeDetection(mode: EvDbChangeDetection): this`.
  - `EvDbSnapshotStrategy.changeDetection: EvDbChangeDetection` (default `"always"`). It does not count toward `hasRules`.
  - `GenericView.onApplyEvent`: no handler → `false`. Handler ran → `mode === "always" || next !== prev`.

- [ ] **Step 1: Write the failing tests:**
  - `Given the default mode, When a handler returns the same reference, Then the next store writes a full row`.
  - `Given trusted mode, When a handler returns the same reference, Then the next store writes a pointer row`.
  - `Given trusted mode, When a handler returns a new object, Then the next store writes a full row`.
  - `Given trusted mode, When a handler mutates in place and returns the same reference, Then a pointer row is written (known risk of trusted mode)`.
  - `Given a strategy that only calls changeDetection("trusted"), When a changed view stores, Then a full row is written on every store` (no rules still means "store every time").
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the core tests and `pnpm build`.** Expected: PASS; counts not higher.
- [ ] **Step 5: Commit** `feat(core): always and trusted change detection`.

---

### Task 6: `DeepReadonly` view state

**Files:**
- Create: `packages/types/src/view/DeepReadonly.ts`
- Modify: `packages/core/src/factories/StreamFactoryBuilder.ts:16-22` (`EventHandlersFromMap`)
- Modify: `packages/core/src/factories/EvDbViewFactoryTypes.ts:6-10` (`EvDbViewEventHandler`)
- Modify: `packages/core/src/view/EvDbView.ts` (`state` getter type)
- Modify: `packages/core/src/view/EvDbSnapshotStrategyBuilder.ts` (`state` in `onEvent` predicates and `matchesEvent`)
- Modify: any sample, demo or test handler that mutates its input and now fails to compile
- Test: `packages/core/src/factories/StreamFactoryBuilder.deepReadonly.test.ts` (create)

**Interfaces:**
- Produces: `export type DeepReadonly<T>`. It leaves functions and primitives as they are. Arrays and tuples become readonly with deep elements. `Map` becomes `ReadonlyMap`, `Set` becomes `ReadonlySet`, and other objects get readonly mapped properties, applied deeply. Handlers become `(oldState: DeepReadonly<TState>, event: Readonly<TEvent>, metadata) => DeepReadonly<TState>`. `view.state` returns `DeepReadonly<TState>`.
- Do not add a constraint that rejects a mutable `TState` (the spec explains why).

- [ ] **Step 1: Write the type test.** Inside handlers of a real `StreamFactoryBuilder` view, use `// @ts-expect-error` on `s.items.push(1)`, `s.count = 1`, `s.nested.flag = true` and `s.tags.set("a", 1)` (a `Map`). Also check that `{ ...s, items: [...s.items, 1] }` and `return s` compile without errors. Add one runtime `test` so the file runs.
- [ ] **Step 2: Run `pnpm build`.** Expected: FAIL with "Unused '@ts-expect-error' directive".
- [ ] **Step 3: Implement the type and apply it.**
- [ ] **Step 4: Run `pnpm build`, `pnpm exec eslint .` and `pnpm test:unit`.** Expected: clean; counts not higher.
- [ ] **Step 5: Commit** `feat(core)!: view state is DeepReadonly`.

---

### Task 7: Migration scripts copy old snapshots into `snapshot_v2`

**Files:**
- Create: `packages/adapters/postgres-storage-adapter/scripts/copy-snapshot-to-snapshot-v2.sql`
- Create: `packages/adapters/mysql-storage-adapter/scripts/copy-snapshot-to-snapshot-v2.sql`
- Modify: both adapters' `package.json` `files` (add `scripts`)
- Create: `packages/adapters/dynamodb-storage-adapter/src/copySnapshotsToV2.ts`
- Test: `apps/sample-app/src/tests/snapshotMigration.integration.test.ts` (create)

**Interfaces:**
- Produces: `export async function copySnapshotsToV2(client: DynamoDBClient): Promise<{ readonly views: number; readonly copied: number }>`.

Postgres script:

```sql
INSERT INTO snapshot_v2 (id, stream_type, stream_id, view_name, "offset", state, state_offset, stored_at)
SELECT DISTINCT ON (stream_type, stream_id, view_name)
       id, stream_type, stream_id, view_name, "offset", state, "offset", stored_at
FROM snapshot
ORDER BY stream_type, stream_id, view_name, "offset" DESC
ON CONFLICT DO NOTHING;
```

MySQL script (needs MySQL 8 window functions):

```sql
INSERT INTO snapshot_v2 (id, stream_type, stream_id, view_name, `offset`, state, state_offset, stored_at)
SELECT id, stream_type, stream_id, view_name, `offset`, state, `offset`, stored_at
FROM (SELECT s.*, ROW_NUMBER() OVER (PARTITION BY stream_type, stream_id, view_name ORDER BY `offset` DESC) AS rn
      FROM snapshot s) latest
WHERE rn = 1
ON DUPLICATE KEY UPDATE id = snapshot_v2.id;
```

DynamoDB: pass 1 scans `snapshots`, projecting only `view_address` and `offset`, and keeps the max offset per view in a `Map<string, number>`. Pass 2 does `GetItem` of each latest item, then `PutItem` into `snapshot_v2` with `state_offset` = `offset` and `ConditionExpression: "attribute_not_exists(view_address)"`. A `ConditionalCheckFailedException` counts as skipped.

- [ ] **Step 1: Write the failing tests** (per database). Seed the old table with rows at 3 and 7 for view A and at 2 for view B.
  - `When the copy runs, Then snapshot_v2 holds A@7 and B@2 as full rows, and getSnapshotAsync returns them`.
  - `When the copy runs twice, Then it does not fail and the rows are unchanged`.
  - `Given snapshot_v2 already has A@9, When the copy runs, Then getSnapshotAsync(A) still returns offset 9`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** The SQL tests read the `.sql` file and run it with `$executeRawUnsafe`.
- [ ] **Step 4: Run per database, then `pnpm build`.** Expected: PASS; counts not higher.
- [ ] **Step 5: Commit** `feat(adapters): scripts to copy snapshots into snapshot_v2`.

---

### Task 8: Docs, ADR and changesets

**Files:**
- Modify: `docs/guides/snapshots.md`, `docs/guides/storage-adapters.md`
- Create: `docs/guides/immutable-state.md`
- Create: `docs/adr/0005-snapshot-pointer-rows.md`
- Modify: `packages/core/README.md`, `packages/types/README.md`, and the READMEs of `relational-storage-adapter`, `postgres-storage-adapter`, `mysql-storage-adapter` and `dynamodb-storage-adapter`
- Modify: `docs/README.md`, `llms.txt`, `AGENTS.md` ("Docs to update": add a row for change detection / immutable state)
- Create: changesets (major) for `@eventualize/types`, `@eventualize/core`, and the four adapter packages

The content is fixed by the spec's "Documentation" section. It must include:
- The write table (pointer / full / nothing).
- Both modes, with the safety level of each.
- The start/end-only case.
- The `offsetGap` guard-rail advice: a view that changes often but fires rarely writes nothing, so only `offsetGap` bounds its replay.
- The safe-setup ESLint and `tsconfig` settings, with the holes table.
- Best practices.
- The copy-paste block for a consumer's `AGENTS.md` / `CLAUDE.md`.
- The rollout order: create `snapshot_v2`, deploy, run the copy script, retire old SDKs, and only then drop the old table.

- [ ] **Step 1: Write the docs, the ADR and the changesets.**
- [ ] **Step 2: Check that every code sample in the docs matches the real API names** (`changeDetection`, `snapshot_v2`, `copySnapshotsToV2`, script paths).
- [ ] **Step 3: Run the full gate:** `pnpm build`, `pnpm lint`, `pnpm test`. Expected: all green, counts not higher than the Task 1 baseline.
- [ ] **Step 4: Commit** `docs: snapshot pointer rows, change detection, immutable state`.
