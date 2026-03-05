# Outbox API — Product Requirements Document

## Motivation

EvDb streams previously supported outbox message production via `withEventType(eventType, messagesProducer?)`.
The low-level producer type is:

```ts
type EVDbMessagesProducer = (
  event: EvDbEvent,
  viewStates: Readonly<Record<string, unknown>>,
) => EvDbMessage[];
```

This is weakly typed — callers must manually cast the event payload and view states, which is verbose, error-prone, and provides no IDE autocomplete for domain-specific fields.

`withEventType` has been **removed**. Its responsibilities are split:

- Event registration → `withEvent(name)`
- Outbox message production → `withMessageFactory(messageType, eventType, factory)`

The `withMessageFactory` API provides full type inference for both the event payload and view states.

---

## Goal

Add a `withMessageFactory` method to `StreamFactoryBuilder` that:

- Binds to a **specific registered event type** via a plain string
- Receives **typed event payload** — `T` supplied as an explicit type argument, no runtime token or cast needed
- Receives **typed view states** (inferred from registered views — `views.Sum.sum`, not `(viewStates["Sum"] as SumState).sum`)
- Returns a **typed message payload or `undefined`** — `undefined` suppresses emission
- Converts internally to `EVDbMessagesProducer` so the rest of the pipeline is unchanged

Remove `withEventType` entirely — `withEvent` is the only way to register events.

---

## Constraints

### `withEvent` signature is frozen — do not modify

The `withEvent` method signature is **fixed** and must not be changed:

```ts
withEvent<T extends object>(eventType: string): this
```

- **One explicit type arg only** (`T` — the event payload type)
- `TEventName` is **inferred** from the runtime string argument — callers do not pass it
- The 2-arg form `withEvent<T, TEventName>` does **not** exist and must never be introduced

Valid usage:

```ts
.withEvent<FundsCaptured>(FundsEventNames.FundsCaptured)
```

Invalid — never write this:

```ts
.withEvent<FundsCaptured, FundsEventNames.FundsCaptured>(FundsEventNames.FundsCaptured) // ❌
```

Any implementation of `withMessageFactory` or other features must work within this constraint.

---

## API Design

### New method: `StreamFactoryBuilder.withMessageFactory`

```ts
withMessageFactory<T extends object>(
  messageType: string,
  eventType: string,
  factory: (
    event: EvDbEvent & { readonly payload: T },
    views: { [K in keyof TViews]: TViews[K] extends EvDbView<infer S> ? S : never },
  ) => unknown,
): this
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `messageType` | `string` | The `messageType` field set on the emitted `EvDbMessage` |
| `eventType` | `string` | The registered event name this factory fires for |
| `factory` | function | Receives typed event (with `payload: T`) and typed view states; returns payload or `undefined` |

**Type inference:**

- `T` is the explicit payload type — `event.payload` is typed as `T`, no cast needed
- `views` is typed as `{ [K in keyof TViews]: StateOf<TViews[K]> }` — view states, not view objects, fully inferred from registered views
- `eventType` is a plain `string` — a wrong name silently produces no messages at runtime (not a compile error); verify with tests

**Return value:** `this` — chaining continues normally.

### Internal conversion

`withMessageFactory` registers its factory as a standard `EVDbMessagesProducer` on the matching `EventTypeConfig`:

```ts
const producer: EVDbMessagesProducer = (event, viewStates) => {
  if (event.eventType !== eventType) return [];
  const payload = factory(
    event as EvDbEvent & { payload: T },
    viewStates as TypedViewStates,
  );
  if (payload === undefined) return [];
  return [EvDbMessage.createFromEvent(event, messageType, payload)];
};
// appended to EventTypeConfig.eventMessagesProducers for eventType
```

Multiple `withMessageFactory` calls for the **same** event type are all appended and all fire.

---

## Behavior Specification

| Scenario | Result |
|---|---|
| Factory returns a payload object | One `EvDbMessage` emitted with that payload and `messageType` |
| Factory returns `undefined` | No message emitted (conditional suppression) |
| Multiple factories for the same event | Each fires independently; messages are collected and stored atomically |
| Multiple factories for different events | Only the factory matching the appended event fires |

---

## Full Example

```ts
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

// Event payload types (plain objects — no eventType field declared by consumer)
type PointsAdded = { points: number };
type PointsSubtracted = { points: number };
type PointsMultiplied = { multiplier: number };

// View state types
type SumState = { sum: number };
type CountState = { count: number };

// View handlers (abbreviated)
const sumViewHandlers = {
  PointsAdded: (state: SumState, event: PointsAdded) =>
    ({ sum: state.sum + event.points }),
  PointsSubtracted: (state: SumState, event: PointsSubtracted) =>
    ({ sum: state.sum - event.points }),
  PointsMultiplied: (state: SumState, event: PointsMultiplied) =>
    ({ sum: state.sum * event.multiplier }),
};

const countViewHandlers = {
  PointsAdded: (state: CountState) => ({ count: state.count + 1 }),
  PointsSubtracted: (state: CountState) => ({ count: state.count + 1 }),
  PointsMultiplied: (state: CountState) => ({ count: state.count + 1 }),
};

// Stream factory with message factories
const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  // Register events (withEvent only — withEventType is removed)
  .withEvent<PointsAdded>("PointsAdded")
  .withEvent<PointsSubtracted>("PointsSubtracted")
  .withEvent<PointsMultiplied>("PointsMultiplied")
  // Register views
  .withView("Sum", { sum: 0 } satisfies SumState, sumViewHandlers)
  .withView("Count", { count: 0 } satisfies CountState, countViewHandlers)
  // Message factory: fires when PointsMultiplied is appended
  // T=PointsMultiplied — event.payload.multiplier typed, no cast
  // views.Sum is SumState, views.Count is CountState — fully typed
  .withMessageFactory<PointsMultiplied>(
    "PointsMultipliedNotification",
    "PointsMultiplied",
    (event, views) => ({
      multiplier: event.payload.multiplier,
      currentSum: views.Sum.sum,
      currentCount: views.Count.count,
    }),
  )
  // Message factory: fires when PointsAdded is appended — emits sum notification
  .withMessageFactory<PointsAdded>(
    "PointsAddedSumNotification",
    "PointsAdded",
    (event, views) => ({
      pointsAdded: event.payload.points,
      pointsSum: views.Sum.sum,
    }),
  )
  // Message factory: fires when PointsAdded is appended — emits count notification
  // Returns undefined when count is 0 to suppress emission
  .withMessageFactory<PointsAdded>(
    "PointsAddedCountNotification",
    "PointsAdded",
    (event, views) =>
      views.Count.count > 0
        ? {
            pointsAdded: event.payload.points,
            pointsCount: views.Count.count,
          }
        : undefined,
  )
  .build();
```

### Migration from `withEventType`

Before (removed):

```ts
.withEventType<PointsAdded, "PointsAdded">("PointsAdded", (event, viewStates) => [
  EvDbMessage.createFromEvent(event, "PointsAddedSumNotification", {
    pointsAdded: (event.payload as unknown as PointsAdded).points,
    PointsSum: (viewStates["Sum"] as SumState).sum,
  }),
])
```

After (split into two calls):

```ts
.withEvent<PointsAdded>("PointsAdded")
.withMessageFactory<PointsAdded>(
  "PointsAddedSumNotification",
  "PointsAdded",
  (event, views) => ({
    pointsAdded: event.payload.points,
    pointsSum: views.Sum.sum,
  }),
)
```

---

## Acceptance Criteria

1. `withMessageFactory<T>(messageType, eventType, factory)` compiles with `T` as the only explicit type arg
2. `event.payload` inside the factory is typed as `T` with no cast
3. TypeScript infers view states (not view objects) from the registered views — accessing `.Sum.sum` works without casting
4. Returning `undefined` from the factory emits no message
5. Multiple `withMessageFactory` calls for the same event type all fire and their messages are collected
6. Multiple `withMessageFactory` calls for different event types each fire only for their respective event
7. `withEventType` is removed — `withEvent` registers events, `withMessageFactory` registers outbox producers
7a. `withEvent` signature is **unchanged** — still `withEvent<T>(eventType: string)` with exactly one explicit type arg; implementations must not add a second type parameter
8. Messages are stored atomically with the event
9. `pnpm build && pnpm test && pnpm lint` all pass
