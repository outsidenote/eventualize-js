# SDK API Advisor — API Enforcement Techniques

How to enforce correct API usage at compile time, not runtime. Ranked by preference.

## Table of Contents

1. [Decision Guide](#decision-guide)
2. [Technique 1: Structural (TypeScript Generics)](#technique-1-structural-typescript-generics)
3. [Technique 2: Phase-Locked Builder Types](#technique-2-phase-locked-builder-types)
4. [Technique 3: Template Literal Types](#technique-3-template-literal-types)
5. [Technique 4: Mapped Types for Per-Event APIs](#technique-4-mapped-types-for-per-event-apis)
6. [Technique 5: Conditional Types for Extraction](#technique-5-conditional-types-for-extraction)
7. [Technique 6: Custom ESLint Plugin](#technique-6-custom-eslint-plugin)
8. [Technique 7: Code Generation (Last Resort)](#technique-7-code-generation-last-resort)
9. [IntelliSense and Mapped Types](#intellisense-and-mapped-types)
10. [Real Patterns from This Codebase](#real-patterns-from-this-codebase)

---

## Decision Guide

```
Can it be expressed purely with types/generics?
  ✓ YES → Use structural enforcement (Techniques 1–5)
  ✗ NO  → Can a linter rule catch it at save time?
              ✓ YES → Write an ESLint plugin (Technique 6)
              ✗ NO  → Is there truly no structural solution after thorough exploration?
                          ✓ YES → Use code generation (Technique 7, last resort)
                          ✗ NO  → Try harder with structural approach first
```

**Cognitive load rule:** Users should not need to read docs to use the API correctly. The type system should guide them.

---

## Technique 1: Structural (TypeScript Generics)

The preferred approach. Make wrong usage a type error.

**Principle:** Accumulate type state through generic parameters as the user chains calls.

```typescript
// Each call widens TEvents — you can only use events you registered
class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType = never,   // grows with each withEvent()
  TEventNames extends string = never,        // grows with each withEvent()
  TViews extends Record<string, unknown> = {}, // grows with each addView()
>
```

**Benefit:** If you try to handle an event you never registered, the handlers map type rejects it at compile time.

---

## Technique 2: Phase-Locked Builder Types

**Principle:** Each phase returns a *different* class with a *different* method set. Wrong-order calls are `Property does not exist` errors.

```typescript
// StreamFactoryBuilder exposes withViews() but NOT addView()
// ViewBuilder exposes addView() but NOT withEvent()
// MessageFactoryBuilder exposes add*() methods and build() only

// Example: This is a type error — withEvent() doesn't exist on ViewBuilder
new StreamFactoryBuilder("stream")
  .withViews()
  .withEvent<Foo>("foo")  // ← Type error: Property 'withEvent' does not exist
```

**Implementation:**
- Each phase is a separate class or type alias
- Return type of each transition method is the next phase's type
- Methods not valid in that phase simply don't exist on the returned type

This is used throughout `StreamFactoryBuilder.ts` — `withViews()` returns `ViewBuilder`, which has no `withEvent()`.

---

## Technique 3: Template Literal Types

**Principle:** Generate method name strings from type-level event name literals.

```typescript
// Source: StreamFactoryBuilder.ts — MessageFactoryMethods type
type MessageFactoryMethods<TStreamType, TEvents, TViews> = {
  readonly [K: `add${string}`]: (
    messageType: string,
    factory: (payload: IEvDbPayloadData, views: TViews, meta: IEvDbEventMetadata) => unknown,
  ) => FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
};
```

This accepts any `add*` method call — broad but allows IDEs to show the methods, and wrong method names fall through to a type error.

For exact names, use mapped types (see Technique 4).

**Template literal in return type** — `appendEvent${string}`:

```typescript
// Source: EvDbStreamFactory.ts
type AppendEventMethods = {
  [K: `appendEvent${string}`]: (event: object) => Promise<void>;
};
```

Users get `appendEventFundsCaptured()`, `appendEventFundsDeposited()`, etc. — all typed, all callable.

---

## Technique 4: Mapped Types for Per-Event APIs

**Principle:** Generate exact method names from a union of event name literals using `as` remapping in mapped types.

```typescript
// Source: StreamFactoryBuilder.ts — FromEventMethods type
type FromEventMethods<TState, TEvents extends IEvDbEventType> = {
  readonly [E in TEvents as `from${E["eventType"]}`]: (
    handler: (state: TState, payload: never, meta: IEvDbEventMetadata) => TState,
  ) => FullViewHandlerBuilder<TState, TEvents>;
};
```

**What this gives:**
- If `TEvents` = `FundsCaptured | FundsDeposited`, you get exact methods `fromFundsCaptured()` and `fromFundsDeposited()`
- IDE shows only the methods for events you registered — no more, no less
- Typos like `fromFundsCapture` (missing 'd') are type errors

**Combined with instance injection:** The type says what methods exist; runtime injection makes them real:

```typescript
// Type-level: declares fromFundsCaptured() exists
type FullViewHandlerBuilder<TState, TEvents> =
  ViewHandlerBuilder<TState, TEvents> & FromEventMethods<TState, TEvents>;

// Runtime: injects the actual function
instance[`from${eventName}`] = function(handler) { ... };
```

---

## Technique 5: Conditional Types for Extraction

**Principle:** Use distributive conditional types to transform union types.

```typescript
// Source: StreamFactoryBuilder.ts
// Strips the IEvDbEventType sentinel to recover raw payload unions
type ExtractPayload<T> = T extends IEvDbEventType ? Omit<T, "eventType"> : never;

// Example:
// TEvents = (FundsCaptured & { eventType: "FundsCaptured" }) | (FundsDeposited & { eventType: "FundsDeposited" })
// ExtractPayload<TEvents> = FundsCaptured | FundsDeposited
```

Use conditional types when you need to:
- Strip framework-internal fields from user-facing payload types
- Narrow a type union based on a discriminant
- Transform a complex internal type into a simpler public API type

---

## Technique 6: Custom ESLint Plugin

Use when structural TypeScript cannot enforce the constraint — typically for:
- Call ordering that spans multiple statements (not just method chains)
- Required calls that must happen before `build()`
- Conventions that can't be expressed in the type system (naming, file structure)

**When to consider it:**
- You've tried structural approaches and they can't express the constraint
- The mistake is common and causes runtime errors that are hard to debug
- You want error messages at save time, not just at compile time

**Example constraints that might need a linter:**
- "Must call `withEvent()` at least once before `build()`"
- "Stream factory files must be named `*StreamFactory.ts`"
- "All event types in `withEvent<T>()` must be in the corresponding `*Events/` folder"

For creating an ESLint plugin, see the [skill-developer guide](../../skill-developer/SKILL.md).

---

## Technique 7: Code Generation (Last Resort)

Use **only** when:
- Structural types cannot express the constraint
- A linter rule is insufficient or too complex
- The alternative is requiring users to repeat themselves dangerously

**Triggers for considering codegen:**
- Type erasure prevents zero-arg generic APIs (e.g., `new MyFactory<FooEvent>()` with no runtime value)
- You need runtime string literals that match compile-time types (e.g., `payloadType`)
- The pattern is TanStack-style: codegen bridges compile-time types to runtime values

See the [typescript-source-gen skill](../../typescript-source-gen/SKILL.md) for when and how to implement codegen.

**Warning:** Codegen adds toolchain complexity. Users must run a generate step. Prefer structural solutions even if they require clever TypeScript.

---

## IntelliSense and Mapped Types

**IntelliSense discoverability is a first-class requirement.** Index signatures erase all per-method autocomplete; mapped types preserve it.

### Index signature — no discoverability

```typescript
// User types "stream.appendEvent" → IDE shows nothing useful
type AppendEventMethods = {
  [K: `appendEvent${string}`]: (event: object) => Promise<void>;
};
```

TypeScript accepts any `appendEvent*` call but offers zero autocomplete. Users cannot discover which methods exist without reading docs.

**Current state in this codebase:** `AppendEventMethods` on `StreamWithEventMethods` uses this form — a known gap.

### Mapped type — full discoverability

```typescript
// User types "stream.appendEvent" → IDE lists appendEventFundsCaptured, appendEventFundsDeposited, ...
type AppendEventMethods<TEvents extends IEvDbEventType> = {
  readonly [E in TEvents as `appendEvent${E["eventType"]}`]: (
    event: Omit<E, "eventType">,
  ) => Promise<void>;
};
```

Benefits over the index signature form:

- IDE autocomplete enumerates every registered event name
- Payload type is narrowed per-event (`FundsCaptured` shape, not just `object`)
- Typos (`appendEventFundsCapture` missing `d`) are type errors, not silent runtime misses

**Already done correctly:** `FromEventMethods` on the view handler builder uses the mapped-type form — use this as the reference model.

### Rule: always prefer mapped type over index signature for per-event methods

When adding any `*${EventName}` method family to a public type, use:

```typescript
readonly [E in TEvents as `prefix${E["eventType"]}`]: (payload: ...) => ...
```

Never use `[K: \`prefix${string}\`]` for methods users are expected to discover and call.

---

## Real Patterns from This Codebase

### Pattern: Enforce "at least one withEvent before build"

Currently not enforced structurally — `build()` is available immediately on `StreamFactoryBuilder`. To enforce at least one event, you could use conditional default:

```typescript
// Hypothetical: TEvents = never means build() returns a restrictive type
public build(): TEvents extends never
  ? { error: "Must call withEvent() at least once" }
  : EvDbStreamFactory<TEvents, TStreamType, TViews>
```

This is a trade-off — it adds complexity. The current codebase accepts the simpler (unenforced) approach.

### Pattern: View State Typed from addView defaultState

```typescript
// addView<TViewName extends string, TState>(name: TViewName, defaultState: TState, ...)
// TypeScript infers TState from the literal passed as defaultState:
.addView("balance", 0, ...)         // TState = number, TViews = { balance: number }
.addView("history", [], ...)        // TState = never[] initially...
.addView("history", [] as string[], ...) // better: explicit cast for literal inference
```

Teach users to use `as const` or explicit type annotations on `defaultState` when the inferred type is too wide.

### Pattern: views accessor typed from TViews

After `build()`, the stream's `views` property is typed as `TViews`:

```typescript
// If TViews = { Sum: { sum: number }, Count: { count: number } }
stream.views.Sum.sum    // ← number, fully typed
stream.views.Count.count // ← number, fully typed
stream.views.Unknown    // ← Type error: Property 'Unknown' does not exist
```

This is enforced via a Proxy at runtime + `TViews` type at compile time — both levels agree.

### Pattern: `as unknown as TargetType` for type widening in builders

When you need to widen a type (union grows) in a builder, use the double-cast:

```typescript
// Wrong: return this as StreamFactoryBuilder<..., TEvents | NewEvent, ...>
// → TypeScript error: TEvents is not assignable to TEvents | NewEvent

// Correct:
return this as unknown as StreamFactoryBuilder<
  TStreamType,
  TEvents | (T & IEvDbEventType & { readonly eventType: E }),
  TEventNames | E,
  TViews
>;
```

This is the canonical pattern for fluent builders with accumulating type state. The `as unknown` step erases the current type; the second cast applies the target type. Safe when you control the invariant.
