# View Snapshot Strategy — Design

Date: 2026-10-29. Status: approved in chat.

## Intent

Today every view stores a snapshot on every `stream.store()`. The hook
`EvDbViewRaw.shouldStoreSnapshot` exists but always returns `true`, and
`withView` gives the client no way to change it. Clients need to choose, per
view, when a snapshot is stored, to cut snapshot writes on busy streams while
keeping load time bounded.

## Goals

- Per-view snapshot strategy, defined inside `withView`.
- Full IntelliSense: event names, payload types, and view state are inferred
  from the builder.
- Small, readable API: short rule names inside a scoped, fluent callback.

## Non-goals

- Timers. `durationGapMs` is checked only when the stream stores.
- A stream-wide default strategy.
- Snapshot writes from replay (`goToOffset`, `forward`) or read-only streams.
  They never store today, and this does not change.
- Changes to `IEvDbViewStore` in `@eventualize/types`.

## API

```ts
const PointsFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded").asType<PointsAdded>()
  .withEvent("AccountClosed").asType<AccountClosed>()

  .withView("Balance", 0, {
    PointsAdded: (s, e) => s + e.points,
  }, (snapshot) => snapshot
    .when(({ offsetGap, durationGapMs }) => offsetGap >= 50 || durationGapMs >= 5 * 60_000)
    .onEvent("AccountClosed")                              // any AccountClosed event
    .onEvent("PointsAdded", (_state, e) => e.points > 1_000))  // e typed as PointsAdded

  .withView("Audit", [] as string[], { /* ... */ })  // no strategy: store on every save

  .withView("Risk", [] as string[], { /* ... */ }, (snapshot) => snapshot
    .offsetGap(50)
    .durationGapMs(5 * 60_000)
    .onEvent((_s, _e, m) => m.streamCursor.offset === 1))  // first event of the stream

  .build();
```

```ts
export interface EvDbSnapshotContext {
  offsetGap: number;      // memoryOffset - storeOffset
  durationGapMs: number;  // now - storedAt
}

// state is the view state after the event is applied.
export interface EvDbSnapshotStrategyBuilder<TState, TEventMap extends Record<string, object>> {
  when(predicate: (ctx: EvDbSnapshotContext) => boolean): this;
  // Any event. event is the union of all payloads.
  onEvent(
    predicate: (
      state: TState,
      event: TEventMap[keyof TEventMap & string],
      metadata: IEvDbEventMetadata,
    ) => boolean,
  ): this;
  // One event type. Matches when metadata.eventType === eventType and the
  // predicate (default: always true) returns true. event is typed exactly.
  onEvent<K extends keyof TEventMap & string>(
    eventType: K,
    predicate?: (
      state: TState,
      event: TEventMap[K],
      metadata: IEvDbEventMetadata & { eventType: K },
    ) => boolean,
  ): this;
  offsetGap(events: number): this;     // gap >= events
  durationGapMs(ms: number): this;     // gap >= ms
}
```

The callback may return the builder (fluent) or nothing (statements). Both work.

Revision 2026-10-29 (during Task 1): the first design used a rest-parameter
union of tuples so that `m.eventType === "X"` would narrow `e`. TypeScript does
not narrow one tuple element through a property of another, and that shape
also rejected predicates with fewer than 3 parameters. Replaced by the two
`onEvent` overloads above.

## Rules

1. A strategy applies only to its own view.
2. Rules combine with OR. A view with no rules stores on every save (today's
   behavior). A callback that adds no rules counts as no rules.
3. `onEvent`: each view keeps an in-memory flag. It starts `false`. It becomes
   `true` when a predicate returns `true`; it never goes back to `false` because
   of a predicate. The predicate runs at most once per event the view applies
   (events the view skips by offset do not run it), after the state is updated.
   While the flag is already `true`, predicates are skipped. Predicates must be
   pure.
   Catch-up events that `factory.get()` applies after loading a snapshot do
   not run it: they are already stored. Replay (`goToOffset`, `forward`)
   does not run it either: it never stores.
4. The flag resets to `false` only after `storeSnapshotAsync` succeeds. If the
   call throws, the flag stays `true` and is retried at the next `store()` that
   writes events (`store()` with no pending events returns early). If an event
   is applied while the write is in flight, the flag stays `true` and
   `storeOffset` is the offset captured before the write.
5. `storedAt` updates to now only after a snapshot is stored. A fresh view's
   `storedAt` is its creation time, so `durationGapMs` does not fire before the
   first interval has passed. To store on the stream's first event, use
   `onEvent((_s, _e, m) => m.streamCursor.offset === 1)` (`factory.create()`
   streams start at offset 1; clone targets start at offset 0, so use `=== 0`
   there, and `offsetGap` counts one extra event).
6. `offsetGap` and `durationGapMs` throw `RangeError` for a negative value or
   `NaN`, when `withView` runs.
7. An error thrown by a predicate propagates to the caller (`appendEvent` or
   `store()`).

## Also fixed

- `EvDbViewRaw.store()`: the local `secondsSinceLatestSnapshot` holds
  milliseconds. Rename it to `msSinceLatestSnapshot`.

## Left to the builder

- Internal names of the compiled strategy and the flag.
- Test helper shape for counting stored snapshots.
