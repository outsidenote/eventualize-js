# ADR 0002 — Span filtering per stream factory

**Status:** Accepted
**Date:** 2026-10-29

## Context

eventualize-js produces a span for every stream operation, for every appended
event (`eventualize.stream.append`) and for every storage adapter call
(`eventualize.adapter.*`). In a busy service this is a lot of spans, and most
of them repeat what the parent span already says. Developers need to balance
detail against noise.

The stream factory is where a developer declares a stream, so it is the place
to declare its tracing too. But the storage adapter is not part of the factory:
it is passed to `get`, `create`, `goToOffset` and `clone` at call time, and one
adapter instance serves many factories.

## Decision

- `StreamFactoryBuilder.withTelemetry({ spans })` takes a map from span
  selector (span name, group wildcard, or `"*"`) to on/off. The keys are a
  union of string literals, so a typo does not compile. The most specific
  selector wins; spans that no selector matches keep `EVDB_DEFAULT_SPANS`.
- By default `eventualize.stream.append` and `eventualize.adapter.*` are off.
- Core puts the resolved policy in the OpenTelemetry `Context` around each
  operation. Adapters read it with `evDbTracerFor(spanName, tracer)`, which
  returns the API's no-op tracer when the span is off. The policy types and
  helpers live in `@eventualize/types/telemetry/EvDbSpanPolicy`, because
  adapters depend on `@eventualize/types` and not on core.
- A span that is off is skipped. We do not use `suppressTracing`, because it
  would also hide spans from other instrumentation (pg, Prisma, AWS SDK).

## Consequences

- Existing users stop getting the append and adapter spans unless they turn
  them on.
- An adapter called directly, outside a stream, uses the defaults.
- Context propagation needs a registered context manager (every OTel Node SDK
  registers one). Without one, adapters see the defaults.
- Custom adapters must use `evDbTracerFor` to follow the policy.
