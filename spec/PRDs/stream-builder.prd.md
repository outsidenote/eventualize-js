# Stream Builder Refactor PRD

## Goal

Refactor `StreamFactoryBuilder` to enforce a strict **4-phase fluent API** with better type safety.
Order is enforced structurally — each phase returns a distinct builder type that only exposes the
next phase's methods.

---

## Target API

```ts
const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  // Phase 1 — Events (mandatory, repeatable)
  .withEvent<PointsAdded>("PointsAdded")
  .withEvent<PointsSubtracted>("PointsSubtracted")
  .withEvent<PointsMultiplied>("PointsMultiplied")

  // Phase 2 — Views (optional, enter with .withViews(), then add with .addView())
  .withViews()
    .addView("Sum", { sum: 0 }, (state: { sum: number }, payload: PointsAdded | PointsSubtracted | PointsMultiplied, meta: IEvDbEventMetadata) => state)
    .addView("Count", { count: 0 }, countViewHandler)

  // Phase 3 — Messages (optional, enter with .withMessages(), then add per-event with .addXxx())
  .withMessages()
    .addPointsAdded("Points Added With Sum Notification", (payload: PointsAdded, views: { Sum: { sum: number }; Count: { count: number } }, meta: IEvDbEventMetadata) => ({
      pointsAdded: payload.points,
      PointsSum: views.Sum.sum,
    }))
    .addPointsAdded("Points Added With Count Notification", (payload: PointsAdded, views: { Sum: { sum: number }; Count: { count: number } }, meta: IEvDbEventMetadata) => ({
      pointsAdded: payload.points,
      PointsCount: views.Count.count,
    }))
    .addPointsMultiplied("Points Multiplied", (payload: PointsMultiplied, views: { Sum: { sum: number }; Count: { count: number } }, meta: IEvDbEventMetadata) => ({
      multiplier: payload.multiplier,
    }))

  // Phase 4 — Build
  .build();
```

IMPORTANT:

- `withEvent` signature must be frozen do not change it

### API Changes Summary

| Aspect | Current | Target |
| --- | --- | --- |
| Enter views phase | `.withView(name, state, handlers)` (repeated) | `.withViews()` → `.addView(name, state, handler)` |
| View handler | `EvDbStreamEventHandlersMap` (a record of per-event handlers) | Single handler `(state, payload, meta) => state` |
| Enter messages phase | `.withMessages()` | `.withMessages()` (unchanged) |
| Per-event message method | `.withPointsAdded(...)` | `.addPointsAdded(...)` |
| Message factory signature | `(event: EvDbEvent, views) => unknown` | `(payload: TPayload, views, meta: IEvDbEventMetadata) => unknown` |
| Skip views | Supported | Supported — `.withViews()` is optional |
| Skip messages | Supported | Supported — `.withMessages()` is optional |

---

## Phases & Allowed Transitions

```text
EventBuilder  →  withViews()   →  ViewBuilder   →  withMessages()  →  MessageBuilder  →  build()
              →  withMessages() →  MessageBuilder →  build()
              →  build()
```

- **EventBuilder** — exposes: `withEvent()`, `withViews()`, `withMessages()`, `build()`
- **ViewBuilder** — exposes: `addView()`, `withMessages()`, `build()`
- **MessageBuilder** — exposes: `add<EventName>()` per registered event, `build()`

Calling `withEvent()` after `withViews()` or `withMessages()` is a **compile-time error** (method not present on returned type).

---

## Milestones

### Milestone 1 — Structural Refactor (no type-safety changes)

**Goal**: Introduce `withViews()` / `addView()` and rename `.withXxx()` → `.addXxx()` in the
message phase. No changes to generic type params yet — `any`/`unknown` placeholders are acceptable
where typing would require Milestone 2 work.

**Scope**:

1. Add `withViews()` method to `StreamFactoryBuilder` (EventBuilder phase).
   - Returns a new `ViewBuilder` class (or sub-builder object).
   - `ViewBuilder` does NOT expose `withEvent()`.

2. Add `addView(name, defaultState, handler)` to `ViewBuilder`.
   - Handler signature: `(state: unknown, payload: unknown, meta: IEvDbEventMetadata) => unknown`
     (typed properly in Milestone 2).
   - `addView()` returns `this` (same `ViewBuilder`).
   - Internally accumulate views in the same `viewConfigs` array used today.

3. Add `withMessages()` to `ViewBuilder` (same behavior as today's `withMessages()`).

4. Rename per-event methods in the message phase: `.withPointsAdded` → `.addPointsAdded`
   (prefix `add` instead of `with`).
   - Update all call sites in tests and examples.

5. Change message factory signature from `(event: EvDbEvent, views) => unknown`
   to `(payload: IEvDbPayloadData, views, meta: IEvDbEventMetadata) => unknown`.
   - Extract `payload` and `metadata` from `event` internally before calling the factory.
   - Update all call sites in tests.

6. Keep existing `withView()` on `StreamFactoryBuilder` deprecated but working
   (or remove immediately — decide based on whether there are non-test callers).

7. All existing tests must pass. Add/update tests to cover:
   - `withViews()` → `addView()` path
   - `withMessages()` called from `ViewBuilder`
   - `withMessages()` called from `EventBuilder` (views-less path)
   - `.addXxx()` method naming

**Acceptance**: `pnpm build && pnpm test && pnpm lint` passes.

---

### Milestone 2 — Type Safety: View Handler Payload

**Goal**: Make `addView`'s handler payload typed as the union of all registered event payloads.

**Scope**:

1. `ViewBuilder` receives `TEvents` (union of registered event payloads, same as today's
   `TEvents` in `StreamFactoryBuilder`).

2. `addView<TState>(name, defaultState, handler)` handler typed as:

   ```ts
   (state: TState, payload: ExtractPayload<TEvents>, meta: IEvDbEventMetadata) => TState
   ```

   where `ExtractPayload<TEvents>` strips the `eventType` sentinel to give the raw payload union.

3. View state type `TState` is inferred from `defaultState` argument.

4. `TViews` record accumulates `Record<TName, EvDbView<TState>>` as before.

**Acceptance**: Handler payload is inferred — no manual cast needed in tests.

---

### Milestone 3 — Type Safety: Message Factory Payload & Views

**Goal**: Make `.addXxx()` message factories fully typed — no casts on `payload` or `views`.

**Scope**:

1. `TEventMap` (map of event name string literal → payload type) is carried through into
   `MessageBuilder` (same mechanism as current `withPointsAdded` injection).

2. Injected per-event method `add<EventName>` receives:

   ```ts
   (
     messageType: string,
     factory: (payload: TPayload, views: TypedViewStates<TViews>, meta: IEvDbEventMetadata) => unknown,
   ) => this
   ```

   where `TPayload` is `TEventMap[EventName]`.

3. Remove remaining casts like `(event.payload as PointsAdded)` from all test files.

4. `TypedViewStates<TViews>` already exists — wire it to the message factory `views` param.

**Acceptance**: Test factories compile without any type assertions on payload or views.

---

### Milestone 4 — Type Safety: View Handler Discriminated Union (stretch)

**Goal**: Allow view handlers to be per-event discriminated (current behavior via handler map)
OR a single catch-all handler (new behavior). Make both ergonomic.

> This milestone is **optional** — evaluate after Milestone 2 ships. The single-handler API
> introduced in Milestone 1 may be sufficient for most use cases.

**Scope** (if pursued):

1. `addView` overload that accepts a `Partial<Record<EventName, (state, payload, meta) => state>>`
   map (restores current handler-map ergonomics with proper typing).

2. Overload that accepts single handler typed as discriminated union so the user can switch
   on `payload` type inside.

3. Both overloads must infer `TState` from `defaultState`.

---

## Non-Goals

- No changes to `EvDbStream`, `EvDbStreamFactory`, `EvDbView`, or storage adapters.
- No changes to the `appendEventXxx` methods on the produced stream.
- No changes to how `build()` works internally.
- Backwards-compatible re-export of renamed types is not required (this is an internal refactor).


# Process

- [x] Milestone 1
- [ ] Milestone 2
- [ ] Milestone 3
- [ ] Milestone 4
