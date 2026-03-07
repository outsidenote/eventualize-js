# PRD: Simplify Outbox Message Factory API (DRY Event Type)

## Problem

`withMessageFactory` requires the caller to pass both a generic type argument **and** a runtime string for the same event type. This is redundant because the event was already registered with `withEvent<T>("EventName")`.

```ts
// Current: "PointsAdded" appears twice — once as the type arg,
// once as the runtime discriminator string.
.withMessageFactory<PointsAdded>(
  "Points Added With Sum Notification",
  "PointsAdded",           // ← redundant; already declared via withEvent
  (event, views) => ({ ... }),
)
```

Beyond the redundancy, `withMessageFactory` is called on the builder before all views are known, so the factory's `views` parameter is not yet fully typed. This means the compiler cannot validate access to individual view states at the call site.

This violates DRY, is a source of bugs (mismatched type arg and string), and prevents full type safety on view access.

---

## Goal

1. Declare each event type exactly once (at `withEvent`).
2. Ensure both `event.payload` and `views` are concretely typed at every factory call site.
3. The correct moment to generate per-event factory methods is **after** all views are registered, because only then is `TViews` fully resolved.

---

## Proposed API

A new method `withMessageFactories()` marks the point at which events **and** views are fully known. It returns a **message factory builder** — a separate object whose prototype carries one typed method per registered event. Each method's `event` parameter is typed to that event's payload and `views` is typed to the concrete state of every registered view.

```ts
const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent<PointsAdded>("PointsAdded")
  .withEvent<PointsSubtracted>("PointsSubtracted")
  .withEvent<PointsMultiplied>("PointsMultiplied")
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .withView("Count", { count: 0 }, countViewHandlers)
  .withMessageFactories()          // ← seals TEvents + TViews; returns MessageFactoryBuilder
  .withPointsAdded(
    "Points Added With Sum Notification",
    (event, views) => ({           // event: EvDbEvent & { payload: PointsAdded }
      pointsAdded: event.payload.points,
      PointsSum: views.Sum.sum,    // views: { Sum: { sum: number }, Count: { count: number } }
    }),
  )
  .withPointsAdded(
    "Points Added With Count Notification",
    (event, views) => ({
      pointsAdded: event.payload.points,
      PointsCount: views.Count.count,
    }),
  )
  .withPointsMultiplied(
    "Points Multiplied",
    (event) => ({
      multiplier: event.payload.multiplier,
    }),
  )
  .build();
```

### Key design decisions

- `withMessageFactories()` is the type-sealing boundary. Calling it returns a `MessageFactoryBuilder<TEvents, TViews>` whose prototype is populated with one method per event: `with<EventName>(messageType, factory)`.
- Method names are derived from the registered event name: `"PointsAdded"` → `.withPointsAdded(...)`, `"PointsMultiplied"` → `.withPointsMultiplied(...)`.
- Each method is repeatable — calling `.withPointsAdded(...)` multiple times registers multiple independent producers for the same event.
- **`withMessageFactories()` is entirely optional.** Calling `build()` directly on `StreamFactoryBuilder` (without any `withView` or `withMessageFactories`) is valid. All three forms below must compile:

```ts
// Form 1 — events only, no views, no outbox
new StreamFactoryBuilder("funds-stream")
  .withEvent<FundsCaptured>(FundsEventNames.FundsCaptured)
  .withEvent<FundsDenied>(FundsEventNames.FundsDenied)
  .build();

// Form 2 — events + views, no outbox
new StreamFactoryBuilder("PointsStream")
  .withEvent<PointsAdded>("PointsAdded")
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .build();

// Form 3 — events + views + outbox (withMessageFactories)
new StreamFactoryBuilder("PointsStream")
  .withEvent<PointsAdded>("PointsAdded")
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .withMessageFactories()
  .withPointsAdded("Points Added", (event, views) => ({ ... }))
  .build();
```

- When `withMessageFactories()` is called with no prior `withView` calls, `TViews` defaults to `{}` and the `views` parameter in every factory is typed as `{}` (empty object).
- `build()` is available on **both** `StreamFactoryBuilder` and `MessageFactoryBuilder`.

---

## Implementation Approach — Two-phase prototype injection

### Phase 1 — `StreamFactoryBuilder` (unchanged from today)

Accumulates `TEvents` and `TViews` through `withEvent` and `withView` calls as before. `TViews` defaults to `{}` when no `withView` calls are made. The `withEvent` call does **not** need to capture a string literal type — event name literals will be captured in Phase 2.

### Phase 2 — `withMessageFactories()` constructs `MessageFactoryBuilder`

At call time, `TEvents` and `TViews` are both fully resolved. `withMessageFactories()`:

1. Creates a `MessageFactoryBuilder<TEvents, TViews>` instance that holds a reference back to the parent builder's internal state.
2. Iterates over each registered event name (available at runtime as `this.eventTypes`).
3. For each event name `"PointsAdded"`, injects a method `withPointsAdded` onto the `MessageFactoryBuilder` prototype, closing over the event name string.
4. Returns the builder cast to its typed intersection:

```ts
type MessageFactoryMethods<TEvents, TViews> = {
  [K in Extract<TEvents, { eventType: string }>["eventType"] as `with${K}`]: (
    messageType: string,
    factory: (
      event: EvDbEvent & { readonly payload: Extract<TEvents, { eventType: K }> },
      views: TypedViewStates<TViews>,
    ) => unknown,
  ) => MessageFactoryBuilder<TEvents, TViews> & MessageFactoryMethods<TEvents, TViews>;
};

type FullMessageFactoryBuilder<TEvents, TViews> =
  MessageFactoryBuilder<TEvents, TViews> & MessageFactoryMethods<TEvents, TViews>;
```

`withMessageFactories()` return type:

```ts
withMessageFactories(): FullMessageFactoryBuilder<TEvents, TViews>
```

### Why this works where earlier approaches did not

| Problem | Earlier approach | This approach |
| --- | --- | --- |
| `TViews` not yet known | Prototype added at `withEvent` time | Prototype added at `withMessageFactories()` — after all `withView` calls |
| Event name not a string literal in type | Tried to infer name from `T` | Iterates runtime `this.eventTypes` array; each method closes over its literal name |
| `event.payload` not typed per event | Template index signature with `string` | Mapped type over event name union — each method has a distinct overload |

> **Note on `TEvents` shape:** For `Extract<TEvents, { eventType: K }>` to work, `TEvents` must encode the event name as a literal. The current `withEvent<T>` accumulates `TEvents | (T & IEvDbEventType)`, where `eventType` is widened to `string`. This needs to be tightened: `withEvent<T, TName extends string>(eventType: TName)` should accumulate `TEvents | (T & { readonly eventType: TName })` so the literal is preserved in the union. This is the only required change to `withEvent`'s signature.

---

## Acceptance Criteria

1. The event type string is declared **once** (at `withEvent`) and not repeated in any factory call.
2. `event.payload` inside each factory is typed to that specific event's payload type — not a union of all events.
3. `views` inside each factory is typed to the concrete state map of all registered views (not `unknown` or a generic record).
4. Multiple factories can be registered per event type; all fire independently on each matching event.
5. `withMessageFactories()` is **optional** — `build()` on a bare `StreamFactoryBuilder` (no views, no outbox) is valid.
6. `withMessageFactories()` called with no prior `withView` calls produces a `views` parameter typed as `{}`.
7. `build()` is available on both `StreamFactoryBuilder` and `MessageFactoryBuilder`.
8. `withMessageFactories()` can only be called after all `withView` calls (structurally enforced or documented — no factories registered before views are sealed).
9. The existing `withMessageFactory(messageType, eventType, factory)` API is **removed**.
10. All existing tests pass; the sample app compiles with zero TypeScript errors.
11. `pnpm build && pnpm test && pnpm lint` pass with no regressions.

---

## Out of Scope

- Changes to `withView`, `withEvent`, or `build` runtime behavior.
- Changes to `EvDbStreamFactory` internals beyond producer registration wiring.
- Renaming conventions for the generated method names beyond stripping the `"MessageFactory"` suffix.
- Enforcing call order between `withView` and `withMessageFactories` at the type level (convention is sufficient).
