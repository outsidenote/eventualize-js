# ADR 0005 — Snapshot pointer rows and change detection

**Status:** Accepted
**Date:** 2026-11-01

## Context

`factory.get()` reads events from the lowest snapshot offset of all views. A
view whose strategy fires rarely (for example only on a start event and an end
event) keeps an old snapshot. Every load then replays a long tail of events,
even when every other view is fresh.

Storing every view on every `store()` fixes the load, but writes the full
state again and again when it did not change. That costs bytes, and on
DynamoDB it costs write capacity.

The hard part is knowing that the state did not change. A wrong "unchanged"
skips a needed state write: the snapshot is silently stale, and the error
shows only on a later load. A wrong "changed" costs one extra write.

## Decision

- **Pointer rows.** When a view's state did not change since its last full
  row, `store()` writes a pointer row: no state, and a `state_offset` that
  names the full row (or no `state_offset` for the default state). When the
  state changed and the strategy fires, it writes a full row. When the state
  changed and the strategy does not fire, it writes nothing, because a pointer
  would claim an older state.
- **One table, nullable `state`.** Full rows and pointer rows share one table
  with the same key as before. We rejected two split tables (one for states,
  one for pointers). One table keeps one write per view per store. Loading
  through a pointer costs a second read: a second query on SQL, a sequential
  `GetItem` on DynamoDB. We accepted that.
- **Pointers name full rows only.** Chains are one step deep, so a load needs
  at most two reads.
- **Consistent reads.** On DynamoDB the full row is read by key with
  `ConsistentRead: true`. We rejected a GSI that finds the latest full row in
  parallel: a GSI is only eventually consistent, so it can return an older
  state than the pointer names.
- **New table `snapshot_v2`.** Old SDK versions keep the old table, so old and
  new versions can run side by side. Snapshots are a cache, so an empty new
  table only costs longer replays. A copy script per database moves the latest
  snapshot of each view.
- **The read result carries `stateRef`.** A view loaded through a pointer
  needs the full row's offset to write its next pointer. Without it, every
  load-then-store cycle would write a full row.
- **Two change-detection modes, set per view** with
  `snapshot.changeDetection(mode)`:
  - `"always"` (default): any event with a handler marks the state as changed.
    It never gives a wrong "unchanged".
  - `"trusted"`: an event marks it as changed only when the handler returns a
    new reference. Safe only if no code mutates the state in place. The
    library does not check this.
  - In both modes, an event type with no handler cannot change the state, so
    it never marks it. This alone fixes the start/end case in `"always"` mode.
- **`DeepReadonly` view state.** Handlers get and return
  `DeepReadonly<TState>`, and `view.state` is `DeepReadonly<TState>`. Honest
  mutations fail to compile. We do not reject a mutable `TState`: the possible
  constraints fail (`T extends DeepReadonly<T>` is TS2313) or reject inferred
  literals.
- **Rejected: a `hash` mode** that compares a hash of the serialized state. It
  costs a serialization and a hash on every store.
- **Rejected: a runtime deep freeze.** It costs time on every event, and does
  not cover objects shared with other code.

## Consequences

- Every `store()` moves the load offset of each clean view forward with a
  small write. A view that changes often but fires rarely still writes
  nothing between firings. The docs tell users to add an `offsetGap` guard
  rail.
- `storeOffset` and `storedAt` move on pointer writes too, so `offsetGap` and
  `durationGapMs` measure from the latest row of either kind.
- Breaking changes: handler types (`DeepReadonly`), the snapshot adapter
  interface (`EvDbStoredSnapshotData.body`, `stateRef` on the read result),
  and the table name. Third-party adapters must change.
- `"trusted"` mode moves a correctness risk to the user. The
  [Immutable view state](../guides/immutable-state.md) guide lists the setup
  that catches most mutations, and the holes that remain.
- Deleting a full row that a newer pointer names makes the load throw. Rows
  are never pruned by the library.
- The old table can be dropped only after every old SDK version is retired.
