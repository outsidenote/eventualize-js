---
name: sdk-api-advisor
description: API design advisor for the EvDb SDK. Use when designing new APIs, adding methods to builders, reviewing StreamFactoryBuilder or EvDbStreamFactory, adding withEvent/withView/withMessages patterns, choosing between structural TypeScript vs linter vs codegen enforcement, builder pattern, prototype pattern, fluent API, type accumulation, phase-locked types, mapped types, template literal types, per-event method injection, fromEvents helper, addView overloads, withEvent generics, cognitive load, compile-time guardrails, api design guidelines, evdb factory, stream factory.
---

# SDK API Advisor

## Purpose

Guide API design decisions for this codebase. Enforces the principle: **wrong usage should be a compile-time error, not a runtime surprise**.

## When to Use

- Design a library API for a new feature (e.g. event registration, view setup, message factories)
- refactor an existing API to improve type safety or ergonomics
- Adding new methods to `StreamFactoryBuilder`, `ViewBuilder`, or `MessageFactoryBuilder`
- Designing a new fluent API or builder
- Choosing how to enforce API constraints (types vs linter vs codegen)
- Reviewing whether an API change degrades type safety
- Adding new event/view/message patterns

---

## Core Principles

### 1. Simple surface, safe internals

The public API should feel effortless. The TypeScript compiler catches misuse — users should not need to read error-prone docs.

> Prefer: `builder.withEvent<FundsCaptured>("FundsCaptured")` — one call, one type arg, one runtime string
> Avoid: separate type registration + runtime registration steps

Keep the complex type machinery in the implementation. The builder pattern helps hide complexity while accumulating type information.

Keep it KISS and DRY.

### 2. Enforcement hierarchy (in priority order)

| Priority | Technique                                                             | Use when                                                |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| 1st      | **Structural** (TypeScript generics, mapped types, conditional types) | Expressible as a type constraint                        |
| 2nd      | **Custom ESLint plugin**                                              | Ordering/naming rules that span statements              |
| 3rd      | **Code generation**                                                   | Type erasure prevents structural solution (last resort) |

Make a genuine effort to solve it structurally before reaching for a linter or codegen. See [API-ENFORCEMENT.md](resources/API-ENFORCEMENT.md) for detailed techniques.

### 3. Builder pattern for sequential APIs

Use a fluent builder when:

- The user must perform steps in order (events → views → messages → build)
- Some steps are optional
- Each step contributes type information that later steps depend on

The phase transition itself is the enforcement: `withViews()` returns `ViewBuilder`, which has no `withEvent()`. Wrong-order calls are type errors.

### 4. Prototype pattern for the internal implementation

Keep the builder API (compile-time) separate from the runtime class (prototype mutation).

- **Builder** = what users write at configuration time
- **EvDbStreamFactory** = what creates and manages stream instances at runtime
- **DynamicStream** = prototype-mutated class with `appendEvent*` methods

This separation lets you add per-event methods dynamically without polluting the public API class.

### 5. Per-event methods from accumulated type state

After events are registered, generate typed per-event methods using mapped types + instance injection:

```typescript
// Type surface (mapped type over TEvents):
type FromEventMethods<TState, TEvents extends IEvDbEventType> = {
  readonly [E in TEvents as `from${E["eventType"]}`]: (handler: ...) => FullViewHandlerBuilder<TState, TEvents>;
};

// Runtime injection (per instance, not prototype — avoids cross-builder interference):
instance[`from${eventName}`] = function(handler) { ... };
```

This gives users `b.fromFundsCaptured()`, `b.fromFundsDeposited()` etc. — exact names, IDE autocomplete, typos are type errors.

### 6. IntelliSense discoverability is a first-class requirement

Every public method added to a type must appear individually in IDE autocomplete. **Index signatures kill discoverability** — a user cannot discover `appendEventFundsCaptured` by typing `stream.appendEvent` if the type is `[K: \`appendEvent${string}\`]`.

**Bad — index signature (no autocomplete):**

```typescript
// User types "stream.appendEvent" → sees nothing useful
type AppendEventMethods = {
  [K: `appendEvent${string}`]: (event: object) => Promise<void>;
};
```

**Good — mapped type (full autocomplete):**

```typescript
// User types "stream.appendEvent" → sees appendEventFundsCaptured, appendEventFundsDeposited, ...
type AppendEventMethods<TEvents extends IEvDbEventType> = {
  readonly [E in TEvents as `appendEvent${E["eventType"]}`]: (
    event: Omit<E, "eventType">,
  ) => Promise<void>;
};
```

**Current gap in this codebase:** `AppendEventMethods` on `StreamWithEventMethods` uses the index-signature form. `FromEventMethods` on the builder uses the mapped-type form (correct). When adding new dynamic method types, **always use the mapped-type form** so users can discover methods via IntelliSense.

The mapped type also gives per-event payload typing: `appendEventFundsCaptured(event)` accepts `FundsCaptured` shape, not just `object`.

See [API-ENFORCEMENT.md](resources/API-ENFORCEMENT.md#intellisense-and-mapped-types) for the full comparison and migration path.

---

## Quick Decision Guide

**I want to add a new builder method:**

1. Which phase does it belong to? (event registration / view setup / message factories)
2. Does it need new type information? → Add a type param or widen an existing one
3. Does it close a phase? → Return a new builder type, not `this`
4. Is it per-event? → Use mapped type + instance injection (not prototype)

**I want to enforce a new constraint:**

1. Can I express it as a type constraint? → Do it (see [API-ENFORCEMENT.md](resources/API-ENFORCEMENT.md))
2. Is it about call ordering across statements? → Consider ESLint rule
3. Nothing works structurally? → Consider codegen (see [typescript-source-gen skill](../typescript-source-gen/SKILL.md))

**I want to add a new addView() overload:**

- See [SAMPLES.md](resources/SAMPLES.md#pattern-2-full-factory-views--3-addview-styles) for all 3 existing patterns
- Use `instanceof` for tagged-wrapper detection (reliable), `typeof === "function"` for plain handlers, object for handlers maps

---

## Real-World Patterns (Quick Reference)

### The full pipeline

```
new StreamFactoryBuilder("stream-name")
  .withEvent<PayloadA>("EventA")   // registers type + runtime name
  .withEvent<PayloadB>("EventB")   // TEvents grows: A | B
  .withViews()                     // → ViewBuilder (no withEvent!)
  .addView("balance", 0, {...})    // TViews grows: { balance: number }
  .withMessages()                  // → MessageFactoryBuilder with add* methods
  .addEventA("msg-type", factory)  // per-event, generated at runtime
  .build()                         // → EvDbStreamFactory
```

### Type accumulation pattern

```typescript
public withEvent<T extends object, E extends string = string>(eventType: E) {
  return this as unknown as StreamFactoryBuilder<
    TStreamType,
    TEvents | (T & IEvDbEventType & { readonly eventType: E }),
    TEventNames | E,
    TViews
  >;
}
```

`as unknown as TargetType` is the canonical pattern for type widening in fluent builders.

### Export the stream type for consumers

```typescript
const MyFactory = new StreamFactoryBuilder("my-stream").withEvent<Foo>("Foo").build();
export type MyStreamType = typeof MyFactory.StreamType;
// Use in function signatures: function process(stream: MyStreamType) { ... }
```

---

## Reference Files

### [resources/SAMPLES.md](resources/SAMPLES.md)

3 real factory patterns from this workspace:

- Minimal (events only) — `FundsPureEventsStreamFactory`
- Full with views — `FundsFullEventsStreamFactory` (all 3 `addView` styles)
- Complete with messages — `PointsStreamFactory`
- Event type definitions and key observations

### [resources/BUILDER-PATTERN.md](resources/BUILDER-PATTERN.md)

Deep dive into the builder implementation:

- Type parameter accumulation
- Phase enforcement via return types
- Per-event method injection (instance vs prototype)
- The `fromEvents()` tagged-wrapper pattern
- The prototype pattern for runtime dynamic classes
- Common pitfalls

### [resources/API-ENFORCEMENT.md](resources/API-ENFORCEMENT.md)

All 7 enforcement techniques with real code:

- Structural generics (preferred)
- Phase-locked builder types
- Template literal types
- Mapped types for per-event APIs
- Conditional types for extraction
- Custom ESLint plugin (when to use)
- Code generation (last resort)

---

## Inspiration Sources

- **TanStack Query / Router** — type-safe fluent APIs, codegen for type-to-runtime bridges
- **Zod** — chainable validation builder, type accumulation, `z.object()` pattern
- **fp-ts / io-ts** — type algebra, compositional design
- **.NET Design Guidelines** — [type design](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/type), [extensibility](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/designing-for-extensibility) (adapted for TypeScript)
