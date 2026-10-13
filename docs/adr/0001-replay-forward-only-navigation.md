# ADR 0001 — Replay navigation is forward-only in v1

**Status:** Proposed
**Date:** 2026-10-12

## Context

`goToOffset` returns a read-only stream at a past offset. Users want to inspect
how views change between offsets.

Views are folds: `state(n) = handler(state(n - 1), event(n))`. A fold cannot run
in reverse. Going one step back means loading a snapshot at or before the target
and folding forward again. That costs a snapshot read plus up to one snapshot
interval of events.

A `backward()` method on the stream would look as cheap as `forward()`. A loop
such as `while (...) await stream.backward()` would re-fold for every step, so
it costs O(n²) reads.

## Decision

v1 exposes `forward(steps)` only. To move back, the caller calls
`factory.goToOffset` with a smaller offset. The cost (a new load) is then
visible at the call site.

## Consequences

- The API stays small, and every method has a predictable cost.
- Debugging tools that need "previous step" must keep their own history or call
  `goToOffset` again.
- A later version can add `backward()` together with an ESLint rule that warns
  when `backward()` runs in a loop and advises iterating forward.
