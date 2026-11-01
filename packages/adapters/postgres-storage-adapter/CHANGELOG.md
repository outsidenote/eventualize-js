# @eventualize/postgres-storage-adapter

## 7.0.0

### Major Changes

- 9511cfd: Breaking: snapshots move to a new table, `snapshot_v2`, and each `store()` writes a small pointer row for a view whose state did not change.

  - **What `store()` writes, per view:** state unchanged since the last full row: a pointer row (no state, only the offset of that full row). State changed and the snapshot strategy fires: a full row. State changed and the strategy does not fire: nothing. Both row kinds move the view's load offset forward, so a view that changes rarely no longer makes every load replay a long tail of events. An event type with no handler in a view never counts as a change. Handler maps must be plain objects with own keys: a handler found only on the prototype (for example a method of a class instance used as the map) is skipped.
  - **Store order (`@eventualize/core`):** `store()` calls on one view now run one at a time, in call order, so a slow write can no longer finish after a later one and leave a pointer to an older row. A failed `store()` still rejects for its caller and does not block the next one.
  - **Custom views (`@eventualize/core`):** `EvDbViewRaw.onApplyEvent` reports "unchanged" only with an explicit `false`. Any other return value, such as `undefined` from a plain-JS override, marks the view as changed.
  - **Change detection (`@eventualize/core`):** new snapshot builder setting `changeDetection("always" | "trusted")`, default `"always"`. `"always"` treats every handled event as a change and is always safe. `"trusted"` treats a handler that returns the same object as "no change". It is safe only when no code mutates view state in place. Add an `offsetGap(n)` guard rail to every strategy: a changed view writes nothing until its strategy fires.
  - **Adapter interface (`@eventualize/types`):** `EvDbStoredSnapshotData` has `body: EvDbSnapshotBody` (`{ kind: "full", state }` or `{ kind: "pointer", stateRef }`) instead of `state`. `EvDbStoredSnapshotResultRaw` and `EvDbStoredSnapshotResult` have `stateRef: EvDbStateRef` (`{ kind: "row", offset }` or `{ kind: "default" }`). `getSnapshotAsync` must resolve a pointer to the state of the full row it names. Third-party adapters must change: an adapter that still reads `record.state` gets `undefined` and breaks. Read `record.body` and switch on `body.kind`: `"full"` carries `body.state`; `"pointer"` carries `body.stateRef` and no state.
  - **Pointer checks (adapters):** on load, the postgres, mysql and DynamoDB adapters throw, naming the view and both offsets, when a pointer row names a missing row, a row that is not a full row, or a row with a greater offset than the pointer.
  - **Tables:** the SQL adapters read and write `snapshot_v2` (nullable `state`, new `state_offset` column). Apply the new `add_snapshot_v2` migration in the postgres and mysql packages. The DynamoDB adapter reads and writes the `snapshot_v2` table (`models/snapshot_v2-table-schema.json`). The old table is not read or written.
  - **Migration:** `scripts/copy-snapshot-to-snapshot-v2.sql` (postgres and mysql packages) and `copySnapshotsToV2(client)` (`@eventualize/dynamodb-storage-adapter/copySnapshotsToV2`) copy the latest snapshot of each view into `snapshot_v2`. They are idempotent and never overwrite a `snapshot_v2` row. Rollout: create `snapshot_v2`, deploy, run the copy, retire old SDK versions, and only then drop the old table. Without the copy, loads only replay more events until new snapshots exist.

  See the Snapshots and Storage adapters guides, and ADR 0005.

### Patch Changes

- be3fcc8: Update dependencies and cap peer ranges at the current major.

  - **Security:** Prisma moves to 7.10.1. `@prisma/adapter-mariadb` 7.10.1 uses `mariadb` 3.5.4, which fixes high-severity SQL injection, credential leak and memory exposure issues in `mariadb` 3.4.5. Users of `@eventualize/mysql-storage-adapter` should update.
  - Peer ranges now allow every newer minor and patch, but not the next major: `@opentelemetry/api` `^1.7.0`, `@aws-sdk/client-dynamodb` `^3.1111.0`, `eslint` `^9.0.0 || ^10.0.0`. No released version is excluded. See ADR 0004.
  - `@typescript-eslint/utils` moves to `^8.72.1`.

- 006831e: Add a README, description, keywords and homepage to each package, so the npm page shows docs.
- Updated dependencies [be3fcc8]
- Updated dependencies [006831e]
- Updated dependencies [a475276]
- Updated dependencies [9511cfd]
- Updated dependencies [a475276]
  - @eventualize/relational-storage-adapter@7.0.0

## 6.2.0

### Minor Changes

- 4f98857: Dependency update (October 2026).

  - The optional `@opentelemetry/api` peer range is now `>=1.7.0` (was `^1.7.0`), so newer API versions do not cause install conflicts.
  - Internal `@eventualize/*` dependencies now use `^` ranges, so your app and our packages can share one copy of a newer 6.x release.
  - Prisma is pinned to `7.10.0`, and the generated Prisma clients were regenerated with that version. Prisma stays a regular dependency, so your app can use a different Prisma version.

### Patch Changes

- Updated dependencies [4f98857]
- Updated dependencies [4f98857]
  - @eventualize/relational-storage-adapter@6.2.0

## 6.1.0

### Minor Changes

- 9634936: Dependency update (October 2026).

  - The optional `@opentelemetry/api` peer range is now `>=1.7.0` (was `^1.7.0`), so newer API versions do not cause install conflicts.
  - Internal `@eventualize/*` dependencies now use `^` ranges, so your app and our packages can share one copy of a newer 6.x release.
  - Prisma is pinned to `7.10.0`, and the generated Prisma clients were regenerated with that version. Prisma stays a regular dependency, so your app can use a different Prisma version.

### Patch Changes

- Updated dependencies [9634936]
- Updated dependencies [6a48ac3]
  - @eventualize/relational-storage-adapter@6.1.0

## 6.0.0

### Major Changes

- 48ab5e4: refine api / remove payload type

### Patch Changes

- Updated dependencies [48ab5e4]
  - @eventualize/relational-storage-adapter@6.0.0

## 5.0.0

### Major Changes

- e062a12: api changes, add withMessages and metadata

### Patch Changes

- Updated dependencies [e062a12]
  - @eventualize/relational-storage-adapter@5.0.0

## 4.4.0

### Minor Changes

- a02ab9b: fix import of PrismaClient

### Patch Changes

- Updated dependencies [a02ab9b]
  - @eventualize/relational-storage-adapter@4.4.0

## 4.3.0

### Minor Changes

- 302c66c: fix: update PrismaClient imports

### Patch Changes

- Updated dependencies [302c66c]
  - @eventualize/relational-storage-adapter@4.3.0

## 4.2.0

### Minor Changes

- da41352: lint builder factory

### Patch Changes

- Updated dependencies [da41352]
  - @eventualize/relational-storage-adapter@4.2.0

## 4.1.0

### Minor Changes

- 96fac8a: structure typesafe view that expose the state direcly

### Patch Changes

- Updated dependencies [96fac8a]
  - @eventualize/relational-storage-adapter@4.1.0

## 4.0.0

### Major Changes

- ec6dc7e: refine view api to reflect a typed state

### Patch Changes

- Updated dependencies [ec6dc7e]
  - @eventualize/relational-storage-adapter@4.0.0

## 3.0.0

### Major Changes

- 28bdfa3: Removal of the EventStore concept

### Patch Changes

- Updated dependencies [28bdfa3]
  - @eventualize/relational-storage-adapter@3.0.0

## 2.1.0

### Minor Changes

- 2730e38: Types and interface refactoring

### Patch Changes

- Updated dependencies [2730e38]
  - @eventualize/relational-storage-adapter@2.1.0

## 2.0.0

### Major Changes

- 29788eb: Initial release of @eventualize packages

### Patch Changes

- Updated dependencies [29788eb]
  - @eventualize/relational-storage-adapter@2.0.0
