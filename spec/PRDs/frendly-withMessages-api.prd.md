# PRD: IntelliSense-Friendly `withMessages()` API

## Problem

`StreamFactoryBuilder.withMessages()` injects per-event methods onto a `MessageFactoryBuilder`
instance at runtime using dynamic string keys:

```ts
instance[`with${capturedName}`] = function (...) { ... };
```

The returned type used a **generic index signature** with a method-level type parameter:

```ts
readonly [K: `with${string}`]: <T extends object>(
  messageType: string,
  factory: (event: EvDbEvent & { readonly payload: T }, ...) => unknown,
) => FullMessageFactoryBuilder<...>;
```

This caused two problems:
1. **IntelliSense did not show the `with${string}` pattern** — the generic `<T>` on the method prevented VS Code from enumerating the pattern as a completion entry.
2. **Redundant explicit type arg** — callers had to write `.withPointsAdded<PointsAdded>(...)` even though the event name already implies the payload type.

## Constraint

`withEvent<T extends object>(eventType: string)` signature is **frozen** — no new type parameters
may be added. This means TypeScript cannot capture the string literal `"FundsCaptured"` into a
type-level map, so a per-event payload-typed mapped type is not achievable without changing the
signature.

## Solution Applied

Mirror the existing `AppendEventMethods` pattern, which **is** visible in IntelliSense:

```ts
// appendEvent${string} — visible in IntelliSense:
type AppendEventMethods = {
  readonly [K: `appendEvent${string}`]: (event: object) => Promise<void>;
};
```

Apply the same approach to `MessageFactoryMethods` — **remove the generic `<T>` from each method**:

```ts
type MessageFactoryMethods<TStreamType, TEvents, TViews> = {
  readonly [K: `with${string}`]: (
    messageType: string,
    factory: (
      event: EvDbEvent & { readonly payload: object },
      views: TypedViewStates<TViews>,
    ) => unknown,
  ) => FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
};
```

**Result:**
- `with${string}` pattern is now visible in IntelliSense (same as `appendEvent${string}`)
- No explicit type arg at call sites — `.withFundsCaptured("notif", (event, views) => ...)`
- Trade-off accepted: `event.payload` typed as `object`; callers cast inline where needed (same level as `appendEvent${string}`)

## Call-site before / after

```ts
// Before (generic T required explicitly):
.withPointsAdded<PointsAdded>("notification", (event, views) => ({
  points: event.payload.points,  // typed as PointsAdded
}))

// After (no explicit type arg; inline cast where needed):
.withPointsAdded("notification", (event, views) => ({
  points: (event.payload as PointsAdded).points,
}))
```

## Files Changed

| File | Change |
|------|--------|
| [StreamFactoryBuilder.ts](packages/core/src/factories/StreamFactoryBuilder.ts) | Removed `<T extends object>` from `MessageFactoryMethods` index signature method; changed `payload: T` → `payload: object`; updated JSDoc comments |
| [StreamFactoryBuilder.test.ts](packages/core/src/factories/StreamFactoryBuilder.test.ts) | Removed explicit `<PayloadType>` type args from `.with<EventName>` calls; added inline `as PayloadType` casts |
