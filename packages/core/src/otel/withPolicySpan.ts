import { context, INVALID_SPAN_CONTEXT, trace } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import { setEvDbSpanPolicy } from "@eventualize/types/telemetry/EvDbSpanPolicy";
import type { EvDbSpanName, EvDbSpanPolicy } from "@eventualize/types/telemetry/EvDbSpanPolicy";
import { getCoreTracer } from "./tracers.js";
import { withSpan } from "./withSpan.js";

// Given to `fn` when its span is off, so `fn` can set attributes without a check.
const NON_RECORDING_SPAN = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);

/**
 * Runs `fn` with `policy` in the active context, so storage adapters called
 * inside it follow the same policy.
 */
export function withSpanPolicy<T>(policy: EvDbSpanPolicy, fn: () => Promise<T>): Promise<T> {
  return context.with(setEvDbSpanPolicy(context.active(), policy), fn);
}

/**
 * Like `withSpan` on the core tracer, but only creates the span when `policy`
 * turns `spanName` on. When it is off, `fn` gets a non-recording span and
 * spans made inside `fn` attach to the caller's active span.
 */
export function withPolicySpan<T>(
  policy: EvDbSpanPolicy,
  spanName: EvDbSpanName,
  fn: (span: Span) => T | Promise<T>,
): Promise<T> {
  return withSpanPolicy(policy, async () =>
    policy[spanName] ? withSpan(getCoreTracer(), spanName, fn) : fn(NON_RECORDING_SPAN),
  );
}
