---
"@eventualize/types": major
"@eventualize/core": major
"@eventualize/relational-storage-adapter": major
"@eventualize/postgres-storage-adapter": major
"@eventualize/mysql-storage-adapter": major
"@eventualize/dynamodb-storage-adapter": major
---

Breaking: snapshots move to a new table, `snapshot_v2`, and each `store()` writes a small pointer row for a view whose state did not change.

- **What `store()` writes, per view:** state unchanged since the last full row: a pointer row (no state, only the offset of that full row). State changed and the snapshot strategy fires: a full row. State changed and the strategy does not fire: nothing. Both row kinds move the view's load offset forward, so a view that changes rarely no longer makes every load replay a long tail of events. An event type with no handler in a view never counts as a change.
- **Change detection (`@eventualize/core`):** new snapshot builder setting `changeDetection("always" | "trusted")`, default `"always"`. `"always"` treats every handled event as a change and is always safe. `"trusted"` treats a handler that returns the same object as "no change". It is safe only when no code mutates view state in place. Add an `offsetGap(n)` guard rail to every strategy: a changed view writes nothing until its strategy fires.
- **Adapter interface (`@eventualize/types`):** `EvDbStoredSnapshotData` has `body: EvDbSnapshotBody` (`{ kind: "full", state }` or `{ kind: "pointer", stateRef }`) instead of `state`. `EvDbStoredSnapshotResultRaw` and `EvDbStoredSnapshotResult` have `stateRef: EvDbStateRef` (`{ kind: "row", offset }` or `{ kind: "default" }`). `getSnapshotAsync` must resolve a pointer to the state of the full row it names. Third-party adapters must change.
- **Tables:** the SQL adapters read and write `snapshot_v2` (nullable `state`, new `state_offset` column). Apply the new `add_snapshot_v2` migration in the postgres and mysql packages. The DynamoDB adapter reads and writes the `snapshot_v2` table (`models/snapshot_v2-table-schema.json`). The old table is not read or written.
- **Migration:** `scripts/copy-snapshot-to-snapshot-v2.sql` (postgres and mysql packages) and `copySnapshotsToV2(client)` (`@eventualize/dynamodb-storage-adapter/copySnapshotsToV2`) copy the latest snapshot of each view into `snapshot_v2`. They are idempotent and never overwrite a `snapshot_v2` row. Rollout: create `snapshot_v2`, deploy, run the copy, retire old SDK versions, and only then drop the old table. Without the copy, loads only replay more events until new snapshots exist.

See the Snapshots and Storage adapters guides, and ADR 0005.
