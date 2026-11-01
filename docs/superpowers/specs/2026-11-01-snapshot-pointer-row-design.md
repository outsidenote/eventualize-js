# Snapshot pointer rows and read-only view state

Date: 2026-11-01
Status: approved by the owner on 2026-11-01

## Why

`factory.get()` reads events from the lowest snapshot offset of all views. A
view whose snapshot strategy fires rarely (for example only on a start event
and an end event) keeps an old snapshot. Every load of the stream then replays
a long tail of events, even when every other view is fresh.

The obvious fix, "store every view on every `store()`", writes the full state
again and again even when it did not change. That costs bytes, and on DynamoDB
it costs write capacity (1 WCU per 1 KB).

This design stores a small **pointer row** when a view's state did not change,
and a **full row** only when it did. A pointer row says "at offset N the state
is the same as the full row at offset M". The load offset moves forward on
every `store()`, and the full state is written only when it changed.

The hard part is knowing that the state did not change. A wrong "unchanged"
skips a state write that was needed: the snapshot is then silently stale, and
the error shows only on a later load. A wrong "changed" only costs one extra
write. The design must never produce a wrong "unchanged" in the default mode.

## Goals

- Every `store()` moves each view's load offset forward, cheaply, when the
  view state did not change.
- The full state is written only when it changed (or may have changed).
- Default mode is provably safe: it never gives a wrong "unchanged".
- An opt-in mode lets users who keep state immutable skip more writes.
- View state is typed `DeepReadonly`, so honest mutations fail to compile.
- Docs tell humans and LLM agents how to set up a project safely, and how to
  pick a snapshot strategy (including an `offsetGap` guard rail).
- Gradual rollout: the new table has a new name, so old and new SDK versions
  can run side by side.

## Non-goals

- A `hash` mode (compare a hash of the serialized state). The owner rejected
  it because of its per-store cost.
- Runtime deep freeze of the state. Not part of either mode in this version.
- Pruning old snapshot rows.
- Batching the per-view snapshot writes in `EvDbStream.store()`.

## Anti-goals

- Any path where the default mode skips a state write that was needed.
- A load that returns a pointer row's offset with a state from a different
  offset than the one the pointer names.

## Decisions made by the owner

1. **Layout: one table, nullable state plus a pointer column.** Chosen over two
   split tables. On SQL it is one write per view per store and one read query.
   On DynamoDB the read of a pointer row costs a second, sequential `GetItem`.
   This was accepted.
2. **New table name `snapshot_v2`.** Old SDKs keep using the old table. A new
   SDK with an empty `snapshot_v2` only replays longer until a snapshot exists.
   Snapshots are a cache, events are the source of truth, so a missing or
   older snapshot is never a correctness problem. The old table must not be
   dropped while an old SDK version still runs.
3. **A migration script** copies existing snapshots into `snapshot_v2`, so
   loads are fast right after the switch.
4. **Two change-detection modes: `"always"` (default) and `"trusted"`.**
5. **`DeepReadonly` view state** in handlers and on `view.state`. This is a
   breaking change for handlers that mutate their input.
6. **Documentation**: safe project setup (strict TypeScript and lint rules)
   for humans and LLM agents, best practices, the start/end-only strategy case,
   and a recommendation to always add an `offsetGap` guard rail.

## Data model

One row per view per offset, append-only, same primary key as today:
`(stream_type, stream_id, view_name, offset)`.

| Column | Full row | Pointer row |
|---|---|---|
| `offset` | offset of this row | offset of this row |
| `state` | the view state (JSON) | `NULL` |
| `state_offset` | `NULL` (or equal to `offset`, builder's choice) | offset of a **full** row |
| `stored_at` | write time | write time |

Invariant: `state_offset` always names a full row, never another pointer row.
Chains are one step deep.

Default-state case: if a view has never had a handler run, and there is no
full row, its state is `defaultState`. The builder chooses how a pointer row
marks this case (for example `state = NULL` and `state_offset = NULL` means
"default state"). The load must then return `defaultState` with the pointer's
offset.

### SQL (Postgres, MySQL)

New Prisma model mapped to table `snapshot_v2`, in both adapter schemas, with
a Prisma migration. Keep the old `snapshot` model and table unchanged.

Latest-row read, sketch:

```sql
SELECT p."offset", p.stored_at, COALESCE(p.state, s.state) AS state
FROM snapshot_v2 p
LEFT JOIN snapshot_v2 s
  ON  s.stream_type = p.stream_type AND s.stream_id = p.stream_id
  AND s.view_name   = p.view_name   AND s."offset"  = p.state_offset
WHERE p.stream_type = $1 AND p.stream_id = $2 AND p.view_name = $3
  AND ($4::bigint IS NULL OR p."offset" <= $4)
ORDER BY p."offset" DESC
LIMIT 1;
```

One statement, so the pointer and its state come from the same consistent
read.

### DynamoDB

New table `snapshot_v2`, same key schema as the current `snapshots` table, new
schema file in `packages/adapters/dynamodb-storage-adapter/models/`. Read: the
existing latest-row `Query` (descending, `Limit 1`, `<= maxOffset` when given).
If the row is a pointer, `GetItem` the full row by its key with
`ConsistentRead: true`.

Do not use a GSI to find the latest full row in parallel. GSIs are only
eventually consistent, so they can return an older state than the pointer
names.

## Adapter interface

`IEvDbStorageSnapshotAdapter` (in `packages/types`):

- `getSnapshotAsync(viewAddress, maxOffset?)` keeps its signature. It resolves
  a pointer row internally and returns the pointer row's `offset` and
  `storedAt`, with the state of the full row it names.
- The read result (`EvDbStoredSnapshotResultRaw`) must also carry the offset
  of the full row behind it (`stateOffset`), or the default-state marker. A
  view loaded through a pointer needs it to write its next pointer. Without
  it, every load-then-store cycle on a stateless server would write a full
  row, and the feature would do nothing. Both SQL and DynamoDB reads return
  `state_offset`. (Builder's call, recorded after the review.)
- A default-state pointer returns no state. The `EvDbView` constructor uses
  `snapshot.state` whenever `offset >= 0`, so it must map this case to
  `defaultState`, not `undefined`.
- `storeSnapshotAsync(...)` must accept both row kinds. Use a discriminated
  union, not optional fields, so a pointer cannot carry a state and a full row
  cannot carry a pointer:

  ```ts
  type EvDbSnapshotWrite =
    | { kind: "full"; /* address, offset, state */ }
    | { kind: "pointer"; /* address, offset, stateOffset (or default marker) */ };
  ```

The exact shape and how it fits `EvDbStoredSnapshotData` is left to the
builder. This is a breaking change for third-party adapters.

## When a view writes, and what

Per view, in `EvDbViewRaw.store()`, after the events are stored:

| State changed since last full row? | Strategy fires? | Write |
|---|---|---|
| no | either | pointer row (every `store()`) |
| yes | yes | full row |
| yes | no | nothing |

Why "nothing" in the last row: a pointer would claim the state equals an older
full row, which is false.

`storeOffset` and `storedAt` advance on both full and pointer writes. So
`offsetGap` and `durationGapMs` measure the distance from the latest row of
either kind, which is the real replay distance on the next load.

The "changed since last full row" flag (call it dirty) is set by events applied
in memory, including events read during load. It resets after a full write,
but only if no event was applied while the write was in flight (same rule as
`_snapshotRequested` today).

## Change-detection modes

Configured per view. Builder's call on the API: add it to the snapshot
strategy builder, for example `snapshot.changeDetection("trusted")`, with
`"always"` as the default when not called.

Both modes share one free and exact rule: handlers are a `Partial` map keyed
by event type (`EvDbViewFactory.ts`, `handleOnApply`). If no handler exists for
an event type, the state cannot change. Such an event never sets dirty.

- **`"always"` (default).** Any event that has a handler sets dirty. It never
  gives a wrong "unchanged". It still fixes the start/end case, because a view
  that handles only start and end events skips almost every store.
- **`"trusted"`.** An event with a handler sets dirty only if the handler
  returned a new reference (`next !== prev`). This is safe only if no code
  mutates the state in place. The library does not check this at runtime.
  The user opts in and accepts the risk described in the docs.

```ts
protected onApplyEvent(e: EvDbEvent): void {
  if (!this.hasHandler(e.eventType)) return; // provably unchanged
  const prev = this._state;
  const next = this.handleOnApply(prev, e.payload, e);
  this._dirty ||= this.changeDetection === "always" || next !== prev;
  this._state = next;
}
```

Sketch only. `hasHandler` does not exist today. A custom `EvDbView` subclass
that does not use the handlers map must be treated as "every event may change
the state".

## DeepReadonly state

- Add a `DeepReadonly<T>` type in `packages/types`. Arrays map to
  `ReadonlyArray`, `Map` to `ReadonlyMap`, `Set` to `ReadonlySet`, objects to
  readonly mapped types.
- Handler `state` parameter and return type become `DeepReadonly<TState>`, in
  both `EventHandlersFromMap` (`StreamFactoryBuilder.ts`) and
  `EvDbStreamEventHandlersMap` (`EvDbViewFactoryTypes.ts`).
- `view.state` returns `DeepReadonly<TState>`. The snapshot strategy
  predicates that receive `state` also get `DeepReadonly<TState>`.
- Do not add a constraint that rejects a mutable `TState`. Tested with tsc
  5.9: `T extends DeepReadonly<T>` fails with TS2313, and the `Equals` trick
  also rejects inferred literals such as `{ a: 1 }`, which is too much
  friction.

Known limits (put them in the docs): TypeScript does not check `readonly` on
assignment, so `const m: { a: number } = state; m.a = 2` compiles without a
cast. Casts, `any`, JavaScript callers, third-party functions that mutate
(`_.set`), and event payload objects stored in state all get past the types.
Only arrays get real protection. In `"always"` mode these limits do not matter
for snapshot correctness. In `"trusted"` mode they do.

## Migration script

Copy the latest snapshot of each view from the old table into `snapshot_v2`
as a full row.

- SQL: one script per database (Postgres, MySQL), for example
  `INSERT ... SELECT` with "latest offset per (stream_type, stream_id,
  view_name)". It must be idempotent (skip rows that already exist) and safe
  to run while the app runs. Keep it out of the Prisma migration, so a big
  table does not block deploys.
- DynamoDB: a TypeScript script that scans `snapshots`, keeps the latest item
  per view, and writes it to `snapshot_v2` with a condition that the item does
  not exist.
- Location and CLI shape are left to the builder.

Rollout order, for the docs: create `snapshot_v2`, deploy the new SDK, run the
migration script, retire old SDK versions, and only then drop the old table.
Rollback is safe: an old SDK reads the old table, gets an older snapshot, and
replays longer.

## Documentation

- `docs/guides/snapshots.md`:
  - Pointer rows and full rows, and what `store()` now writes.
  - The two modes, with the safety level of each.
  - The start/end-only case: why it used to make every load slow, and how
    pointer rows fix it for views whose handlers do not run on most events.
  - Recommend that every strategy includes an `offsetGap(N)` guard rail. A
    view whose state changes often but whose strategy fires rarely gets
    neither a full row nor a pointer, so only `offsetGap` bounds its replay.
- New guide `docs/guides/immutable-state.md` (name is the builder's call):
  - Why mutation matters, and that it matters for correctness only in
    `"trusted"` mode.
  - Safe project setup: `tsconfig` `strict: true`; ESLint with
    `@typescript-eslint/no-explicit-any`, the `no-unsafe-*` rules,
    `@typescript-eslint/consistent-type-assertions` with
    `assertionStyle: "never"` for handler files, `functional/immutable-data`
    from `eslint-plugin-functional`, and `noInlineConfig: true`.
  - The holes that remain even with this setup, as a table.
  - Best practices for humans: return new objects with spread, never store an
    event payload object in state without copying it, keep state JSON-like (no
    `Map`, `Set`, `Date`, or class instances, which do not survive a JSON round
    trip anyway), and never mutate `view.state` outside handlers.
  - A copy-paste block for the consumer's `AGENTS.md` / `CLAUDE.md`, with the
    same rules written as instructions for LLM agents.
- `docs/guides/storage-adapters.md`: the new table, row kinds, and adapter
  interface.
- `packages/core/README.md`, `packages/types/README.md`, and each adapter
  README: public API and schema changes.
- An ADR in `docs/adr/` (0005) for the pointer-row layout and the modes.
- `docs/README.md` and `llms.txt` for the new guide.
- Changesets for every changed published package. This is a breaking change
  (handler types, adapter interface, table).

## Tests

Use `node:test` with Given/When/Then names, next to the code.

- Core unit tests: dirty rules for each mode; no-handler events never set
  dirty; the write table above (pointer, full, nothing); `storeOffset`
  advances on pointer writes; in-flight events keep dirty set.
- A `"trusted"` test that shows the known risk: a handler that mutates in
  place produces a pointer row (documents the trade-off).
- Type tests: mutating `state` in a handler fails to compile
  (`@ts-expect-error`).
- Integration tests on Postgres, MySQL, and DynamoDB: load through a pointer
  row returns the full row's state with the pointer's offset; `maxOffset`
  between a full row and a pointer row; default-state pointer; migration
  script copies the latest row per view and is idempotent.

## Left to the builder

- Exact adapter types and how they replace or extend
  `EvDbStoredSnapshotData`.
- How a pointer row marks "default state".
- Whether a full row stores `state_offset` as `NULL` or equal to `offset`.
- Location and CLI of the migration scripts.
- The change-detection API name and where it lives.
