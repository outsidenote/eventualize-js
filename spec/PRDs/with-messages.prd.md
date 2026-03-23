# PRD: `withMessages` Builder Stage

## Overview

Add a `withMessages` stage to the `StreamFactoryBuilder` fluent API. This stage allows declaring per-event message factories inline — similar to how `withView` declares per-event state reducers — but producing `EvDbMessage[]` instead of reducing state.

## Motivation

Currently, message producers are passed as an optional second argument to `withEventType(eventClass, producer)`. This approach has two problems:

1. **Untyped view access**: The `EVDbMessagesProducer` signature uses `viewStates: Readonly<Record<string, unknown>>`, requiring manual casts to access view state.
2. **Ordering mismatch**: Message producers are declared alongside events, but they depend on views — which are declared later in the builder chain. This means the producer cannot know about view types at declaration time.

The `withMessages` stage solves both by being declared **after** `withView`, giving it access to the fully-typed view state map.

## Target File

`packages/core/src/factories/StreamFactoryBuilder.ts`

## Current Builder Chain

```
StreamFactoryBuilder<TStreamType, TEvents, TViews>
  .withEvent("Name").asType<T>()        // accumulates TEvents
  .withEventType(EventClass, producer?) // accumulates TEvents (legacy, keeps working)
  .withView("name", defaultState, handlers)  // accumulates TViews
  .build()
```

## Proposed Builder Chain

```
StreamFactoryBuilder<TStreamType, TEvents, TViews>
  .withEvent("Name").asType<T>()
  .withView("name", defaultState, handlers)
  .withMessages({                        // NEW — after withView, before build
    EventName: (event, views) => EvDbMessage[],
  })
  .build()
```

## API Design

### `withMessages` Method Signature

```ts
withMessages(
  producers: Partial<EvDbMessageProducersMap<TEvents, TViews>>
): StreamFactoryBuilder<TStreamType, TEvents, TViews>
```

- Returns the **same** builder type (no new type parameter — messages don't change the stream's type shape).
- Can be called **multiple times** (producers merge; last-wins per event type).
- Is **optional** — `build()` remains valid without it.

### `EvDbMessageProducersMap` Type

```ts
type TypedViewStates<TViews extends Record<string, EvDbView<unknown>>> = {
  [K in keyof TViews]: TViews[K] extends EvDbView<infer S> ? S : never;
};

type EvDbMessageProducersMap<
  TEvents extends { eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> = {
  [K in TEvents["eventType"]]: (
    event: Extract<TEvents, { eventType: K }>,
    views: Readonly<TypedViewStates<TViews>>,
  ) => EvDbMessage[];
};
```

Key points:
- **`event` parameter**: Typed as the specific event payload type (extracted from the `TEvents` union via `Extract`), **not** `EvDbEvent`. This gives the producer direct access to typed payload fields (e.g., `event.amount`) without casting.
- **`views` parameter**: A readonly record mapping view names to their **state types** (not `EvDbView` objects). For example, if `withView("balance", 0, ...)` was called, `views.balance` is `number`.
- **`Partial<>`**: Not every event needs a message producer.

### Usage Example

```ts
const FundsEventsAndViewsStreamFactory = new StreamFactoryBuilder("funds-stream")
  .withEvent("FundsCaptured").asType<FundsCaptured>()
  .withEvent("FundsDenied").asType<FundsDenied>()
  .withEvent("FundsDeposited").asType<FundsDeposited>()
  .withEvent("FundsRefunded").asType<FundsRefunded>()
  .withEvent("FundsWithdrawal").asType<FundsWithdrawal>()
  .withView("balance", 0, {
    FundsDeposited: (state, event) => state + event.amount,
    FundsRefunded: (state, event) => state - event.amount,
    FundsCaptured: (state, event) => state - event.amount,
    FundsWithdrawal: (state, event) => state - event.amount,
  })
  .withView("count", 0, {
    FundsDeposited: (state, _event) => state + 1,
  })
  .withMessages({
    FundsDeposited: (event, views) => [
      EvDbMessage.createFromEvent(event, {
        messageType: "funds-balance",
        balance: views.balance,
        amount: event.amount,
      }),
    ],
    FundsWithdrawal: (event, views) => [
      EvDbMessage.createFromEvent(event, {
        messageType: "funds-withdrawal",
        balance: views.balance,
        amount: event.amount,
      }),
    ],
  })
  .build();
```

## Implementation Details

### 1. Store message producers on the builder

Add a private field to `StreamFactoryBuilder`:

```ts
private messageProducers: Record<string, (event: any, views: any) => EvDbMessage[]> = {};
```

### 2. `withMessages` method

```ts
public withMessages(
  producers: Partial<EvDbMessageProducersMap<TEvents, TViews>>,
): StreamFactoryBuilder<TStreamType, TEvents, TViews> {
  Object.assign(this.messageProducers, producers);
  return this;
}
```

### 3. Wire into `build()` → `EventTypeConfig`

In `build()`, for each event type in `this.eventTypes`, if `this.messageProducers[eventName]` exists, set its `eventMessagesProducer` field. The stored typed producer must be adapted to the `EVDbMessagesProducer` signature:

```ts
// Inside build(), for each eventType config:
const typedProducer = this.messageProducers[config.eventName];
if (typedProducer) {
  config.eventMessagesProducer = (event: EvDbEvent, viewStates) => {
    return typedProducer(event.payload as any, viewStates);
  };
}
```

Note: The `event` parameter passed to `EvDbMessage.createFromEvent` is an `EvDbEvent` — but the typed producer receives `event.payload` (the typed payload). This means `EvDbMessage.createFromEvent` cannot be called with just the payload inside the producer. Two options:

**Option A (recommended)**: Pass the full `EvDbEvent` as a third/hidden parameter or make the producer signature `(payload, views, event) => EvDbMessage[]` where `event` is the raw `EvDbEvent` for use in `createFromEvent`.

**Option B**: Change the producer to receive the full `EvDbEvent` but typed with the payload:
```ts
(event: EvDbEvent & { payload: Extract<TEvents, { eventType: K }> }, views: ...) => EvDbMessage[]
```

**Recommendation**: Use Option B — the producer receives the full `EvDbEvent` with the payload type narrowed. This keeps `EvDbMessage.createFromEvent(event, {...})` working naturally.

### Revised Type (Option B)

```ts
type EvDbMessageProducersMap<
  TEvents extends { eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> = {
  [K in TEvents["eventType"]]: (
    event: EvDbEvent & { payload: Extract<TEvents, { eventType: K }> },
    views: Readonly<TypedViewStates<TViews>>,
  ) => EvDbMessage[];
};
```

With Option B, the adapter in `build()` becomes simpler:

```ts
if (typedProducer) {
  config.eventMessagesProducer = (event, viewStates) => typedProducer(event as any, viewStates);
}
```

### Revised Usage Example (Option B)

```ts
.withMessages({
  FundsDeposited: (event, views) => [
    // event.payload.amount is typed as number (from FundsDeposited)
    // event itself is EvDbEvent, so createFromEvent works directly
    EvDbMessage.createFromEvent(event, {
      messageType: "funds-balance",
      balance: views.balance,
      amount: event.payload.amount,
    }),
  ],
})
```

### 4. Backward compatibility

- `withEventType(eventClass, producer?)` continues to work unchanged.
- If both `withEventType(..., producer)` and `withMessages({ EventName: ... })` define a producer for the same event, `withMessages` takes precedence (it runs later in the chain).
- The existing `EVDbMessagesProducer` type in `@eventualize/types` remains unchanged.

### 5. New type exports

Add to `packages/core/src/factories/`:
- `EvDbMessageProducersMap<TEvents, TViews>` — the typed handler map
- `TypedViewStates<TViews>` — utility type extracting view state types

## Scope

### In scope
- `withMessages()` method on `StreamFactoryBuilder`
- Type definitions (`EvDbMessageProducersMap`, `TypedViewStates`)
- Wiring producers into `EventTypeConfig` during `build()`
- Update `FundsEventsAndViewsStreamFactory.ts` sample to use new API

### Out of scope
- Removing `withEventType`'s optional `eventMessagesProducer` parameter (backward compat)
- Changes to `EvDbStream`, `EvDbStreamFactory`, or the message storage pipeline
- Changes to `EvDbMessage` class
- Changes to `EVDbMessagesProducer` type in `@eventualize/types`

## Acceptance Criteria

1. `withMessages({...})` compiles with full type inference for event payloads and view states
2. Omitting events from the map (via `Partial`) compiles without error
3. Providing a handler for a non-existent event name is a compile-time error
4. `event.payload.amount` (or similar typed field access) works without casts inside producers
5. `views.balance` resolves to `number` (not `unknown`) when `withView("balance", 0, ...)` was declared
6. `EvDbMessage.createFromEvent(event, {...})` works inside producers without casting
7. `build()` without `withMessages()` still compiles (optional stage)
8. Messages produced by `withMessages` appear in `stream.getMessages()` after appending events
9. Existing `withEventType(..., producer)` pattern still works unchanged
