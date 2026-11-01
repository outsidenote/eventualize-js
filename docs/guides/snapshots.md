# Snapshots: choose when a view stores

A snapshot is a stored copy of a view's state at one offset. `get()` loads the
latest snapshot of each view and reads only the newer events. It starts reading
at the **lowest** snapshot offset of all views, so one old snapshot makes every
load slow.

On every `stream.store()`, each view writes at most one snapshot row. A
**snapshot strategy** lets a view write its full state less often, while
keeping load time bounded.

## What `store()` writes

There are two kinds of snapshot row:

- A **full row** holds the view state.
- A **pointer row** holds no state. It says: "at this offset, the state is the
  same as the full row at offset M" (or the view's default state). It is small
  and cheap to write.

Each view keeps an in-memory **dirty** flag: "the state may have changed since
the last full row". Per view, `store()` then writes:

| State changed since the last full row? | Strategy fires? | Write |
| --- | --- | --- |
| no | either | pointer row |
| yes | yes | full row |
| yes | no | nothing |

Why "nothing" in the last row: a pointer would claim that the state equals an
older full row, which is false.

- A view with no strategy fires on every save. It writes a full row when the
  state changed, and a pointer row when it did not.
- An event type that has no handler in the view never sets the flag. It cannot
  change the state.
- Both row kinds move the view's load offset forward. `offsetGap` and
  `durationGapMs` measure from the latest row of either kind.
- Events that `get()` reads after the loaded snapshot also set the flag. So a
  restart never loses a change.
- On load, a pointer row is resolved to the full row it names. The view gets
  the pointer's offset and the full row's state.

The rows go to the `snapshot_v2` table. See
[Storage adapters](storage-adapters.md#snapshot-rows-and-snapshot_v2).

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

  .withView("Audit", new Array<string>(), { /* ... */ })       // no strategy: full row on every change

  .withView("Risk", new Array<string>(), { /* ... */ }, (snapshot) => snapshot
    .offsetGap(50)
    .durationGapMs(5 * 60_000)
    .onEvent((_s, _e, m) => m.streamCursor.offset === 1))      // first event of the stream

  .build();
```

The callback may return the builder (fluent) or nothing (statements).

## Rules

The rules decide when a **changed** view writes a full row. A view whose state
did not change writes a pointer row on every `store()`, whatever the rules say.

| Rule | Fires when |
| --- | --- |
| `offsetGap(n)` | `n` or more events are applied but not stored. |
| `durationGapMs(ms)` | The latest row is `ms` or older. |
| `when(ctx => boolean)` | Your check returns `true`. `ctx` is `{ offsetGap, durationGapMs }`. |
| `onEvent(predicate)` | An applied event makes `predicate(state, event, metadata)` return `true`. `state` is the view state after the event is applied. |
| `onEvent(eventType, predicate?)` | The event has this type, and `predicate` (default: always) returns `true`. `event` has the exact payload type. |

`offsetGap(n)` and `durationGapMs(ms)` throw `RangeError` for a negative value
or `NaN`. They throw when `withView` runs.

`changeDetection(mode)` is not a rule. It sets how the view decides that its
state changed. See [Change detection](#change-detection).

## How the rules combine

- A strategy applies only to its own view.
- Rules combine with **OR**. One true rule is enough.
- No rules means the strategy fires on every save. A callback that adds no
  rules counts as no rules.
- Replay (`goToOffset`, `forward`) and read-only streams never store, and do
  not run snapshot rules.

## Change detection

A view sets its dirty flag when it applies an event that has a handler. The
`changeDetection` setting chooses what "changed" means:

```ts
.withView("Session", defaultSession, handlers, (snapshot) => snapshot
  .changeDetection("trusted")
  .onEvent("SessionEnded")
  .offsetGap(500))
```

| Mode | A handled event sets the flag when | Safety |
| --- | --- | --- |
| `"always"` (default) | always | Safe. It never treats a changed state as unchanged. |
| `"trusted"` | the handler returns a new object (`next !== prev`) | Safe only if no code changes the state in place. The library does not check this at runtime. |

In `"trusted"` mode, a handler that changes the state in place and returns the
same object is missed. The view then writes a pointer row over a changed state.
The snapshot is stale, and nothing fails until a later load returns the wrong
state. Use `"trusted"` only with the setup in
[Immutable view state](immutable-state.md).

A handler that returns the same object on purpose (`(s) => s`) is the use case
for `"trusted"`. In `"always"` mode that handler still sets the flag.

## Views that change only on start and end events

Take a view that handles only `SessionStarted` and `SessionEnded`, on a stream
with many other events, and a strategy that fires only on those two events.

Before pointer rows, this view wrote a snapshot only on start and end. Its
snapshot stayed old, and `get()` starts at the lowest snapshot offset of all
views. So every load replayed all events since the last start or end, even
when every other view was fresh.

Now the other events have no handler in this view, so they never set the
flag. Each `store()` writes a small pointer row, and the view's load offset
moves forward. This works in both modes.

It does not help a view whose handlers run on most events. That view stays
dirty, and writes only when its strategy fires. See the next section.

## Always add an `offsetGap` guard rail

A view whose state changes often, but whose strategy fires rarely, writes
**nothing** between firings: no full row, and no pointer. Its snapshot gets
old, and every load replays from it. Only `offsetGap` bounds this:

```ts
(snapshot) => snapshot
  .onEvent("AccountClosed")
  .offsetGap(200)   // guard rail: never more than 200 events to replay for this view
```

The rule: a strategy must fire on every event type that changes the state, or
it must have `offsetGap`. Otherwise a dirty view writes nothing until the
strategy fires. `durationGapMs` is not enough on its own: it is checked only on
`store()`, and it does not bound the number of events.

## Offset gap

The gap is the offset in memory minus the offset of the latest row (full or
pointer). For a view with no row, the base is 0. Streams made with
`factory.create()` start at offset 1, so `offsetGap(n)` means `n` events.
In a cloned stream the first event is offset 0, so the gap counts one extra
event there (see [Clone](clone.md)).

## Time gap

`durationGapMs` is **not a timer**. It is checked only when you call `store()`.
If no `store()` happens, nothing is written, however old the last snapshot is.

The view keeps `storedAt`. For a fresh view it is the creation time. For a
loaded view it is the time of the loaded row. It updates to now after each
row the view writes, full or pointer.

Because of this, a fresh view does not fire `durationGapMs` before the first
interval has passed.

## Event rules and the flag

Each view keeps an in-memory "snapshot requested" flag, `false` at the start.
It is not the dirty flag.

- After the view applies an event, the `onEvent` predicates run. If one
  returns `true`, the flag becomes `true`.
- While the flag is `true`, predicates are skipped.
- At `store()`, a `true` flag means the strategy fires. The flag resets to
  `false` only after `storeSnapshotAsync` succeeds. If the call throws, the
  flag stays `true`, and the next `store()` that writes events tries again. A
  `store()` with no pending events returns early and checks nothing.
- Events the view skips by offset do not run predicates.
- Events that `factory.get()` applies after loading a snapshot do not run
  them. They are already stored. Replay does not run them either.
- If an event is applied while a snapshot write is in flight, its match is
  kept for the next `store()`. The dirty flag is kept the same way.
- `store()` calls on one view run one at a time, in call order. A call made
  while another is in flight waits for it. A failed call does not block the
  next one.

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

## Best practices

- Give every strategy an `offsetGap(n)` guard rail, unless it fires on every
  event type that changes the state.
- Keep the default `"always"` mode unless you measured that full rows cost too
  much, and your project has the [immutable state setup](immutable-state.md).
- Give a view handlers only for the event types that change it. An event with
  no handler costs only a pointer row.
- Keep view state small and JSON-like. A full row stores the whole state.

## Trade-offs

A looser strategy means fewer full rows and more events to read on `get()`.
`offsetGap` bounds the number of events a load reads.

See [ADR 0003](../adr/0003-per-view-snapshot-strategy.md) for the strategy
design, and [ADR 0005](../adr/0005-snapshot-pointer-rows.md) for pointer rows
and change detection.
