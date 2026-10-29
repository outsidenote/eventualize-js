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
    .onEvent((_state, _event, metadata) => metadata.eventType === "AccountClosed"))

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

// One tuple per event, so checking metadata.eventType narrows event.
type EvDbSnapshotEventArgs<TState, TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: [
    state: TState,                                   // state after the event is applied
    event: TEventMap[K],
    metadata: IEvDbEventMetadata & { eventType: K },
  ];
}[keyof TEventMap & string];

export interface EvDbSnapshotStrategyBuilder<TState, TEventMap extends Record<string, object>> {
  when(predicate: (ctx: EvDbSnapshotContext) => boolean): this;
  onEvent(predicate: (...args: EvDbSnapshotEventArgs<TState, TEventMap>) => boolean): this;
  offsetGap(events: number): this;     // gap >= events
  durationGapMs(ms: number): this;     // gap >= ms
}
```

The callback may return the builder (fluent) or nothing (statements). Both work.

## Rules

1. A strategy applies only to its own view.
2. Rules combine with OR. A view with no rules stores on every save (today's
   behavior). A callback that adds no rules counts as no rules.
3. `onEvent`: each view keeps an in-memory flag. It starts `false`. It becomes
   `true` when a predicate returns `true`; it never goes back to `false` because
   of a predicate. The predicate runs once per event the view applies (events
   the view skips by offset do not run it), after the state is updated.
   Catch-up events that `factory.get()` applies after loading a snapshot do
   not run it: they are already stored.
4. The flag resets to `false` only after `storeSnapshotAsync` succeeds. If the
   call throws, the flag stays `true`.
5. `storedAt` updates to now only after a snapshot is stored. A fresh view's
   `storedAt` is its creation time, so `durationGapMs` does not fire before the
   first interval has passed. To store on the stream's first event, use
   `onEvent((_s, _e, m) => m.streamCursor.offset === 1)` (`factory.create()`
   streams start at offset 1).
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
