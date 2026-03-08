# SDK API Advisor — Builder Pattern Deep Dive

Real implementation details from `StreamFactoryBuilder` in this codebase.

## Table of Contents

1. [The Builder Pipeline](#the-builder-pipeline)
2. [Type Parameter Accumulation](#type-parameter-accumulation)
3. [Phase Enforcement via Return Types](#phase-enforcement-via-return-types)
4. [Per-Event Method Injection](#per-event-method-injection)
5. [The fromEvents() Helper Pattern](#the-fromevents-helper-pattern)
6. [The Prototype Pattern for Runtime Classes](#the-prototype-pattern-for-runtime-classes)
7. [Common Pitfalls](#common-pitfalls)

---

## The Builder Pipeline

```
StreamFactoryBuilder  →  ViewBuilder  →  MessageFactoryBuilder  →  EvDbStreamFactory
     (events)              (views)           (messages)              (runtime)
```

Each phase transition is type-enforced — you **cannot** call `withEvent()` after `withViews()` because `ViewBuilder` simply does not have that method.

**Source:** [packages/core/src/factories/StreamFactoryBuilder.ts](../../../../packages/core/src/factories/StreamFactoryBuilder.ts)

```
new StreamFactoryBuilder("my-stream")
  .withEvent<PayloadA>("EventA")    ← EventBuilder phase
  .withEvent<PayloadB>("EventB")    ← still EventBuilder
  .withViews()                      ← returns ViewBuilder (no withEvent!)
  .addView("balance", 0, handlers)  ← repeatable
  .withMessages()                   ← returns MessageFactoryBuilder
  .addEventA("msg-type", factory)   ← per-event, generated at runtime
  .build()                          ← returns EvDbStreamFactory
```

You can also short-circuit:
- `withEvent().build()` — events only, no views, no messages
- `withViews().addView().build()` — views, no messages
- `withViews().addView().withMessages().build()` — full pipeline

---

## Type Parameter Accumulation

`StreamFactoryBuilder` has 4 type parameters that grow as you chain calls:

```typescript
// Source: packages/core/src/factories/StreamFactoryBuilder.ts
export class StreamFactoryBuilder<
  TStreamType extends string,      // stream name literal, e.g. "funds-stream"
  TEvents extends IEvDbEventType = never,  // union of all registered event shapes
  TEventNames extends string = never,      // union of event name literals
  TViews extends Record<string, unknown> = {},  // map of viewName → stateType
>
```

Each `.withEvent<T>(eventType)` call widens `TEvents` and `TEventNames`:

```typescript
// Before: TEvents = never, TEventNames = never
.withEvent<FundsCaptured>(FundsEventNames.FundsCaptured)
// After:  TEvents = FundsCaptured & IEvDbEventType & { eventType: "FundsCaptured" }
//         TEventNames = "FundsCaptured"

.withEvent<FundsDeposited>(FundsEventNames.FundsDeposited)
// After:  TEvents = (FundsCaptured & ...) | (FundsDeposited & ...)
//         TEventNames = "FundsCaptured" | "FundsDeposited"
```

Each `.addView<TViewName, TState>(name, defaultState, handlers)` widens `TViews`:

```typescript
// Before: TViews = {}
.addView("balance", 0, handlers)
// After:  TViews = { balance: number }

.addView("count", { n: 0 }, handlers)
// After:  TViews = { balance: number } & { count: { n: number } }
```

This is intersection accumulation — the compile-time type grows to include every registered name.

---

## Phase Enforcement via Return Types

The key insight: **each builder phase returns a different type** that only exposes the methods valid for that phase.

```typescript
// StreamFactoryBuilder exposes:
withEvent<T>()    → StreamFactoryBuilder (with widened TEvents)
withViews()       → ViewBuilder          (no withEvent!)
withMessages()    → FullMessageFactoryBuilder
build()           → EvDbStreamFactory

// ViewBuilder exposes:
addView()         → ViewBuilder (with widened TViews)
withMessages()    → FullMessageFactoryBuilder
build()           → EvDbStreamFactory
// Does NOT expose: withEvent()

// FullMessageFactoryBuilder exposes:
add<EventName>()  → FullMessageFactoryBuilder (chained, per-event)
build()           → EvDbStreamFactory
// Does NOT expose: withEvent(), withViews(), addView()
```

You enforce the **correct call order at compile time** — wrong-order calls are type errors, not runtime errors.

---

## Per-Event Method Injection

The `from<EventName>()` and `add<EventName>()` methods don't exist on the class prototype. They are injected onto each **instance** at runtime after events are registered.

**Why instance-level (not prototype-level)?** Multiple stream factories can be built in the same process. Prototype mutation would cause cross-builder interference — all factories would share the same `add*` methods. Instance-level injection is safe.

```typescript
// Source: buildMessageBuilder() in StreamFactoryBuilder.ts (simplified)
function buildMessageBuilder(streamType, viewFactories, eventTypes, viewNames) {
  const builder = new MessageFactoryBuilder(streamType, viewFactories, eventTypes, viewNames);
  const instance = builder as unknown as Record<string, unknown>;

  for (const { eventName } of eventTypes) {
    const capturedName = eventName; // capture for closure
    instance[`add${capturedName}`] = function(messageType, factory) {
      // registers a producer for this specific event
      const producer = (event, viewStates) => {
        if (event.eventType !== capturedName) return [];
        const payload = factory(event.payload, viewStates, event);
        if (payload === undefined) return []; // undefined = suppress message
        return [EvDbMessage.createFromEvent(event, messageType, payload)];
      };
      const config = builder.eventTypes.find(e => e.eventName === capturedName);
      if (config) config.eventMessagesProducers.push(producer);
      return builder; // enable chaining
    };
  }

  return builder as FullMessageFactoryBuilder;
}
```

**Type surface** for the injected methods is declared via template literal index signature:

```typescript
// Source: StreamFactoryBuilder.ts
type MessageFactoryMethods<TStreamType, TEvents, TViews> = {
  readonly [K: `add${string}`]: (
    messageType: string,
    factory: (payload: IEvDbPayloadData, views: TViews, meta: IEvDbEventMetadata) => unknown,
  ) => FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
};
```

This gives IDE autocomplete for `add*` methods while keeping the type flexible enough to not enumerate all event names at the type level.

---

## The fromEvents() Helper Pattern

`fromEvents()` is a **tagged wrapper** that distinguishes "builder callback" from "catch-all function" in the `addView()` overload resolution.

```typescript
// Source: StreamFactoryBuilder.ts

// Tagged wrapper class
class ViewHandlerBuilderCallback<TState, TEvents> {
  constructor(
    readonly fn: (builder: FullViewHandlerBuilder<TState, TEvents>) => FullViewHandlerBuilder<TState, TEvents>
  ) {}
}

// Public helper — creates the tagged wrapper
export function fromEvents<TState, TEvents>(fn) {
  return new ViewHandlerBuilderCallback(fn);
}

// In addView() implementation:
if (handlerOrMapOrCallback instanceof ViewHandlerBuilderCallback) {
  // builder callback path
  const vhb = buildViewHandlerBuilder(this.eventTypes);
  const result = handlerOrMapOrCallback.fn(vhb);
  handlers = result.handlers;
} else if (typeof handlerOrMapOrCallback === "function") {
  // catch-all handler path
  singleHandler = handlerOrMapOrCallback;
} else {
  // handlers map path
  handlers = handlerOrMapOrCallback;
}
```

**Why the class wrapper?** A plain function can't be instanceof-checked reliably. A class instance is unambiguous. This is a simple, zero-overhead pattern for runtime dispatch between API shapes.

The `FullViewHandlerBuilder` has per-event `from<EventName>()` methods injected the same way as `add<EventName>()` above — instance-level injection over each registered event:

```typescript
// Generates: b.fromFundsCaptured(), b.fromFundsDeposited(), etc.
function buildViewHandlerBuilder(eventTypes) {
  const builder = new ViewHandlerBuilder();
  const instance = builder as unknown as Record<string, unknown>;
  for (const { eventName } of eventTypes) {
    const capturedName = eventName;
    instance[`from${capturedName}`] = function(handler) {
      builder.handlers[capturedName] = handler;
      return builder;
    };
  }
  return builder;
}
```

The type surface for these methods uses a **mapped type** over `TEvents`:

```typescript
type FromEventMethods<TState, TEvents extends IEvDbEventType> = {
  readonly [E in TEvents as `from${E["eventType"]}`]: (
    handler: (state: TState, payload: never, meta: IEvDbEventMetadata) => TState,
  ) => FullViewHandlerBuilder<TState, TEvents>;
};
```

This gives **exact method names** at the type level (`fromFundsCaptured`, not just `from${string}`), providing full IDE autocomplete and typo detection for registered event names.

---

## The Prototype Pattern for Runtime Classes

`EvDbStreamFactory` creates a `DynamicStream` class at construction time using **prototype mutation**. This is the internal implementation layer — separate from the builder API.

**Source:** [packages/core/src/factories/EvDbStreamFactory.ts](../../../../packages/core/src/factories/EvDbStreamFactory.ts)

```typescript
// Simplified from EvDbStreamFactory.ts
private createDynamicStreamClass() {
  class DynamicStream extends EvDbStream { ... }

  const proto = DynamicStream.prototype as unknown as Record<string, unknown>;
  for (const { eventName } of this.config.eventTypes) {
    proto[`appendEvent${eventName}`] = async function(this: EvDbStream, event: object) {
      return this.append(eventName, event);
    };
  }

  return DynamicStream;
}
```

**Why prototype here (not instance)?** The dynamic class is created once per factory instance, then reused for every stream created by that factory. Prototype mutation here is safe and efficient — all streams from the same factory share the method implementations.

**Separation of concerns:**
- `StreamFactoryBuilder` = compile-time API (builder pattern)
- `EvDbStreamFactory` = runtime implementation (prototype pattern)
- `DynamicStream` instances = what users actually operate on

---

## Common Pitfalls

### 1. TypeScript can't infer literals with partial explicit type application

```typescript
// This does NOT give you a literal type for E:
.withEvent<FundsCaptured, "FundsCaptured">("FundsCaptured")  // ← T explicit + E explicit ✓

// This uses the default (string) for E, not the inferred literal:
.withEvent<FundsCaptured>("FundsCaptured")  // ← T explicit, E inferred from arg ✓ (works!)
```

Actually works fine here because `E` has a default `string` and TypeScript infers `E` from the argument when only `T` is explicit. This was verified during the implementation.

### 2. Don't mutate the builder's prototype for per-event methods

Wrong: modifying `MessageFactoryBuilder.prototype[`add${eventName}`]` — this would affect ALL instances built anywhere in the process.

Correct: assign to `instance[`add${eventName}`]` where `instance` is the specific builder instance being constructed.

### 3. The `return this as unknown as TargetType` pattern

Because type parameters widen (union grows) with each `withEvent()` call, `this` is always narrower than the return type. The double-cast `as unknown as TargetType` is the correct TypeScript idiom for this:

```typescript
return this as unknown as StreamFactoryBuilder<
  TStreamType,
  TEvents | (T & IEvDbEventType & { readonly eventType: E }),
  TEventNames | E,
  TViews
>;
```
