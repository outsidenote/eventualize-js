# Snapshots: choose when a view stores

A snapshot is a stored copy of a view's state at one offset. `get()` loads the
latest snapshot of each view and reads only the newer events.

By default, every view stores a snapshot on every `stream.store()`. On a busy
stream this is many writes. A **snapshot strategy** lets each view store less
often, while keeping load time bounded.

## Quick start

Pass a callback as the 4th argument of `withView`. Event names, payload types
and the view state are inferred.

```ts
const PointsFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded").asType<PointsAdded>()
  .withEvent("AccountClosed").asType<AccountClosed>()

  .withView("Balance", 0, {
    PointsAdded: (s, e) => s + e.points,
  }, (snapshot) => snapshot
    .when(({ offsetGap, durationGapMs }) => offsetGap >= 50 || durationGapMs >= 5 * 60_000)
    .onEvent("AccountClosed")                                  // any AccountClosed event
    .onEvent("PointsAdded", (_state, e) => e.points > 1_000))  // e is typed as PointsAdded

  .withView("Audit", [] as string[], { /* ... */ })            // no strategy: store on every save

  .withView("Risk", [] as string[], { /* ... */ }, (snapshot) => snapshot
    .offsetGap(50)
    .durationGapMs(5 * 60_000)
    .onEvent((_s, _e, m) => m.streamCursor.offset === 1))      // first event of the stream

  .build();
```

The callback may return the builder (fluent) or nothing (statements).

## Rules

| Rule | Stores when |
|------|-------------|
| `offsetGap(n)` | `n` or more events are applied but not stored. |
| `durationGapMs(ms)` | The last snapshot is `ms` or older. |
| `when(ctx => boolean)` | Your check returns `true`. `ctx` is `{ offsetGap, durationGapMs }`. |
| `onEvent(predicate)` | An applied event makes `predicate(state, event, metadata)` return `true`. `state` is the view state after the event is applied. |
| `onEvent(eventType, predicate?)` | The event has this type, and `predicate` (default: always) returns `true`. `event` has the exact payload type. |

`offsetGap(n)` and `durationGapMs(ms)` throw `RangeError` for a negative value
or `NaN`. They throw when `withView` runs.

## How the rules combine

- A strategy applies only to its own view.
- Rules combine with **OR**. One true rule is enough.
- No rules means store on every save. A callback that adds no rules counts as
  no rules.
- Replay (`goToOffset`, `forward`) and read-only streams never store, and do
  not run snapshot rules.

## Offset gap

The gap is the offset in memory minus the offset of the last stored snapshot.
For a view with no snapshot, the base is 0. Streams made with
`factory.create()` start at offset 1, so `offsetGap(n)` means `n` events.
In a cloned stream the first event is offset 0, so the gap counts one extra
event there (see [Clone](clone.md)).

## Time gap

`durationGapMs` is **not a timer**. It is checked only when you call `store()`.
If no `store()` happens, nothing is written, however old the last snapshot is.

The view keeps `storedAt`. For a fresh view it is the creation time. For a
loaded view it is the time of the loaded snapshot. It updates to now after each
stored snapshot.

Because of this, a fresh view does not fire `durationGapMs` before the first
interval has passed.

## Event rules and the flag

Each view keeps an in-memory flag, `false` at the start.

- After the view applies an event, the `onEvent` predicates run. If one
  returns `true`, the flag becomes `true`.
- While the flag is `true`, predicates are skipped.
- At `store()`, a `true` flag means the view stores. The flag resets to `false`
  only after `storeSnapshotAsync` succeeds. If the call throws, the flag stays
  `true`, and the next `store()` that writes events tries again. A `store()` with
  no pending events returns early and checks nothing.
- Events the view skips by offset do not run predicates.
- Events that `factory.get()` applies after loading a snapshot do not run
  them. They are already stored. Replay does not run them either.
- If an event is applied while a snapshot write is in flight, its match is
  kept for the next `store()`.

Predicates must be pure. They can run once per event, or not at all when the
flag is already `true`. An error thrown by a predicate goes to the caller of
`appendEvent` or `store()`.

The flag lives in memory. A restart loses it.

## Recipe: store on the first event

A new stream has no snapshot, and the time gap starts at creation. To store on
the first event, match offset 1 (offset 0 in a cloned stream):

```ts
(snapshot) => snapshot.onEvent((_s, _e, m) => m.streamCursor.offset === 1)
```

## Trade-offs

A looser strategy means fewer writes and more events to read on `get()`. Set
`offsetGap` to bound the number of events a load reads.

See [ADR 0003](../adr/0003-per-view-snapshot-strategy.md) for the reasons
behind this design.
