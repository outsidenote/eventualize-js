# ADR 0003 — Per-view snapshot strategy

**Status:** Accepted
**Date:** 2026-10-29

## Context

Every view stored a snapshot on every `stream.store()`. On a busy stream this
is many writes. Clients need to choose, per view, when a snapshot is stored,
and still keep load time bounded. The hook `EvDbViewRaw.shouldStoreSnapshot`
existed but always returned `true`, and `withView` gave no way to change it.

## Decision

- **API shape.** `withView` takes an optional 4th argument: a callback that
  receives a snapshot strategy builder. The callback is scoped to one view, so
  there is no doubt which view a rule belongs to, and event names, payload
  types and view state are inferred. We rejected positional builder modifiers
  after `withView` (ambiguous scope: does a modifier apply to the last view or
  to all?) and an options object (less IntelliSense, less fluent).
- **Rules combine with OR.** A view with no rules, or a callback that adds
  none, stores on every save. This keeps today's behavior.
- **`onEvent` uses an in-memory flag per view.** A matching event sets it; `state` in the predicate is the view state after the event.
  The flag resets only after `storeSnapshotAsync` succeeds, so a failed write
  is retried at the next `store()` that writes events. While the flag is `true`, predicates are
  skipped. Predicates must be pure. They do not run for catch-up events that
  `factory.get()` applies after loading a snapshot, because those are already
  stored. Replay does not run them either, because it never stores.
- **`onEvent` has two overloads:** one for any event, one for a single event
  type with the exact payload type. A first design used a rest-parameter union
  of tuples. TypeScript does not narrow `event` through `metadata.eventType`
  in that shape, and it rejects predicates with fewer parameters.
- **Offset gap base is 0** for a view with no snapshot, because streams start
  at offset 1. So `offsetGap(n)` means `n` events.
- **`durationGapMs` is not a timer.** It is checked only on `store()`.
  `storedAt` starts at the view's creation time (or the loaded snapshot's
  time) and updates after each stored snapshot.

## Consequences

- Fewer snapshot writes, at the cost of more events to read on `get()`.
- The flag is lost when the process restarts. An event that matched but was
  not stored before a crash does not force a snapshot later. The next gap rule
  or event rule still applies.
- Predicate errors propagate to the caller of `appendEvent` or `store()`.
- Replay and read-only streams never store, as before.
- No change to `IEvDbViewStore` in `@eventualize/types`.
