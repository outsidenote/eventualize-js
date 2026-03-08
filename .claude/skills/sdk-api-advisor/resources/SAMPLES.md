# SDK API Advisor — Real Workspace Samples

All samples below are taken directly from this codebase. Use them as the reference model when designing new APIs or reviewing existing ones.

## Table of Contents

1. [Pattern 1: Minimal Factory (Events Only)](#pattern-1-minimal-factory-events-only)
2. [Pattern 2: Full Factory (Views + 3 addView Styles)](#pattern-2-full-factory-views--3-addview-styles)
3. [Pattern 3: Complete Factory (Views + Messages)](#pattern-3-complete-factory-views--messages)
4. [Pattern 4: External Handler Functions](#pattern-4-external-handler-functions)
5. [Event Type Definitions](#event-type-definitions)
6. [Key Observations](#key-observations)

---

## Pattern 1: Minimal Factory (Events Only)

**Source:** [apps/sample-app/src/eventstore/FundsStream/FundsPureEventsStreamFactory.ts](../../../../apps/sample-app/src/eventstore/FundsStream/FundsPureEventsStreamFactory.ts)

Use when you only need to append and replay events — no views, no outbox messages.

```typescript
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { FundsCaptured } from "./FundsEvents/FundsCaptured.js";
import type { FundsDenied } from "./FundsEvents/FundsDenied.js";
import type { FundsDeposited } from "./FundsEvents/FundsDeposited.js";
import type { FundsRefunded } from "./FundsEvents/FundsRefunded.js";
import type { FundsWithdrawal } from "./FundsEvents/FundsWithdrawal.js";
import { FundsEventNames } from "./FundsEventNames.js";

const FundsPureEventsStreamFactory = new StreamFactoryBuilder("funds-stream")
  .withEvent<FundsCaptured>(FundsEventNames.FundsCaptured)
  .withEvent<FundsDenied>(FundsEventNames.FundsDenied)
  .withEvent<FundsDeposited>(FundsEventNames.FundsDeposited)
  .withEvent<FundsRefunded>(FundsEventNames.FundsRefunded)
  .withEvent<FundsWithdrawal>(FundsEventNames.FundsWithdrawal)
  .build();

export default FundsPureEventsStreamFactory;
export type FundsPureEventsStreamType = typeof FundsPureEventsStreamFactory.StreamType;
```

**What this gives you at runtime:**
- `stream.appendEventFundsCaptured(event)` — per-event append method, typed
- `stream.appendEventFundsDeposited(event)` — and so on for each registered event
- No `views` accessor, no outbox messages

---

## Pattern 2: Full Factory (Views + 3 addView Styles)

**Source:** [apps/sample-app/src/eventstore/FundsStream/FundsFullEventsStreamFactory.ts](../../../../apps/sample-app/src/eventstore/FundsStream/FundsFullEventsStreamFactory.ts)

Demonstrates **all three** `addView()` overloads in one factory:

```typescript
import { StreamFactoryBuilder, fromEvents } from "@eventualize/core/factories/StreamFactoryBuilder";
import { FundsEventNames } from "./FundsEventNames.js";
import type { FundsCaptured } from "./FundsEvents/FundsCaptured.js";
import type { FundsDeposited } from "./FundsEvents/FundsDeposited.js";
import type { FundsRefunded } from "./FundsEvents/FundsRefunded.js";
import type { FundsWithdrawal } from "./FundsEvents/FundsWithdrawal.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

type AllEventTypes = FundsCaptured | FundsDenied | FundsDeposited | FundsRefunded | FundsWithdrawal;

const FundsFullEventsStreamFactory = new StreamFactoryBuilder("funds-stream")
  .withEvent<FundsCaptured>(FundsEventNames.FundsCaptured)
  .withEvent<FundsDenied>(FundsEventNames.FundsDenied)
  .withEvent<FundsDeposited>(FundsEventNames.FundsDeposited)
  .withEvent<FundsRefunded>(FundsEventNames.FundsRefunded)
  .withEvent<FundsWithdrawal>(FundsEventNames.FundsWithdrawal)
  .withViews()

  // ── Style 1: Handlers map (object keyed by event name literal) ──────────────
  .addView("balance", 0, {
    [FundsEventNames.FundsDeposited]: (oldState: number, event: FundsDeposited) =>
      oldState + event.amount,
    [FundsEventNames.FundsWithdrawal]: (oldState: number, event: FundsWithdrawal) =>
      oldState - event.amount,
    [FundsEventNames.FundsCaptured]: (oldState: number, event: FundsCaptured) =>
      oldState - event.amount,
    [FundsEventNames.FundsRefunded]: (oldState: number, event: FundsRefunded) =>
      oldState + event.amount,
  })

  // ── Style 2: Builder callback via fromEvents() ──────────────────────────────
  // Fluent API: each .from<EventName>() call adds a typed handler.
  // Only handle the events you care about; others leave state unchanged.
  .addView(
    "max-deposit",
    0,
    fromEvents((b) =>
      b.fromFundsDeposited((oldState: number, event: FundsDeposited) =>
        oldState > event.amount ? oldState : event.amount,
      ),
    ),
  )

  // ── Style 3: Single catch-all handler ───────────────────────────────────────
  // Handler receives every event; use meta.eventType to discriminate.
  .addView(
    "last-activity",
    [],
    (_oldState: string[], event: AllEventTypes, meta: IEvDbEventMetadata) =>
      _oldState.length < 10
        ? [..._oldState, meta.eventType]
        : [..._oldState.slice(1), meta.eventType],
  )

  .withMessages()
  .build();

export default FundsFullEventsStreamFactory;
export type FundsFullEventsStreamType = typeof FundsFullEventsStreamFactory.StreamType;
```

**When to pick each style:**

| Style | Use when |
|-------|----------|
| Handlers map | You have a few events, each with distinct logic. Most readable for sparse handlers. |
| `fromEvents()` callback | You want compile-time autocomplete for `from<EventName>()`. Ideal for typed, selective handling. |
| Catch-all handler | Cross-cutting logic (audit log, last-activity) that runs for every event. |

---

## Pattern 3: Complete Factory (Views + Messages)

**Source:** [apps/sample-app/src/eventstore/PointsStream/PointsStreamFactory.ts](../../../../apps/sample-app/src/eventstore/PointsStream/PointsStreamFactory.ts)

Shows the full pipeline: events → views → outbox messages. Multiple `.add<EventName>()` calls per event = multiple message factories for the same event.

```typescript
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { PointsAdded } from "./PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
import { sumViewHandler } from "./PointsViews/SumViewHandlers.js";
import { countViewHandler } from "./PointsViews/CountViewHandlers.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent<PointsAdded>("PointsAdded")
  .withEvent<PointsSubtracted>("PointsSubtracted")
  .withEvent<PointsMultiplied>("PointsMultiplied")
  .withViews()
  // External handler functions: keep view logic in separate files for testability
  .addView("Sum", { sum: 0 }, sumViewHandler)
  .addView("Count", { count: 0 }, countViewHandler)
  .withMessages()
  // Multiple factories for the same event → multiple outbox messages per event
  .addPointsAdded("Points Added With Sum Notification", (payload, views) => ({
    pointsAdded: (payload as PointsAdded).points,
    PointsSum: views.Sum.sum,      // ← typed: views.Sum is { sum: number }
  }))
  .addPointsAdded("Points Added With Count Notification", (payload, views) => ({
    pointsAdded: (payload as PointsAdded).points,
    PointsCount: views.Count.count, // ← typed: views.Count is { count: number }
  }))
  .addPointsMultiplied("Points Multiplied", (payload) => ({
    multiplier: (payload as PointsMultiplied).multiplier,
  }))
  .build();

export default PointsStreamFactory;
export type PointsStreamType = typeof PointsStreamFactory.StreamType;
```

**Key points:**
- `views.Sum.sum` is typed as `number` — the compiler knows the view state shape
- Returning `undefined` from a factory suppresses that message (no message emitted)
- `withMessages()` is optional — skip it if you don't need outbox integration

---

## Pattern 4: External Handler Functions

**Source:** [apps/sample-app/src/eventstore/PointsStream/PointsViews/SumViewHandlers.ts](../../../../apps/sample-app/src/eventstore/PointsStream/PointsViews/SumViewHandlers.ts)

Externalizing view handlers makes them independently testable:

```typescript
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { PointsAdded } from "../PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "../PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "../PointsEvents/PointsMultiplied.js";
import type { SumViewState } from "./SumViewState.js";

// This function matches the catch-all handler signature expected by addView()
export function sumViewHandler(
  oldState: SumViewState,
  payload: unknown,
  meta: IEvDbEventMetadata,
): SumViewState {
  if (meta.eventType === "PointsAdded") {
    return { sum: oldState.sum + (payload as PointsAdded).points };
  }
  if (meta.eventType === "PointsSubtracted") {
    return { sum: oldState.sum - (payload as PointsSubtracted).points };
  }
  if (meta.eventType === "PointsMultiplied") {
    return { sum: oldState.sum * (payload as PointsMultiplied).multiplier };
  }
  return oldState;
}
```

**Note:** When using the catch-all style for external handlers, `meta.eventType` is the discriminant. If you prefer per-event typing, use the handlers map style instead.

---

## Event Type Definitions

**Source:** [apps/sample-app/src/eventstore/FundsStream/FundsEventNames.ts](../../../../apps/sample-app/src/eventstore/FundsStream/FundsEventNames.ts)

```typescript
export enum FundsEventNames {
  FundsCaptured = "FundsCaptured",
  FundsDenied = "FundsDenied",
  FundsDeposited = "FundsDeposited",
  FundsRefunded = "FundsRefunded",
  FundsWithdrawal = "FundsWithdrawal",
}
```

Event payload types are simple POCOs — no base class required:

```typescript
// FundsDeposited.ts
export type FundsDeposited = { readonly amount: number; readonly currency: string };

// FundsCaptured.ts
export type FundsCaptured = { readonly amount: number };
```

---

## Key Observations

1. **Type safety without repetition** — `withEvent<FundsCaptured>(FundsEventNames.FundsCaptured)` registers both the type and the runtime string in one call. The type arg is required; the string arg is required. No third configuration needed.

2. **Progressive disclosure** — you only pay for what you use. `build()` is always available at any stage. `withViews()` and `withMessages()` unlock more capability only when needed.

3. **`StreamType` export pattern** — `typeof factory.StreamType` gives the fully typed stream instance shape (with `appendEvent*` methods and `views`) for use in function signatures:
   ```typescript
   export type FundsStreamType = typeof FundsPureEventsStreamFactory.StreamType;
   // Usage:
   function processStream(stream: FundsStreamType) { ... }
   ```

4. **Multiple message factories** — calling `.addPointsAdded()` twice is intentional. Each call registers an independent producer for the same event. Both messages are emitted when that event fires.
