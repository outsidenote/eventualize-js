import { context, createContextKey, ProxyTracerProvider } from "@opentelemetry/api";
import type { Context, Tracer } from "@opentelemetry/api";

/** Spans that eventualize-js can produce. */
export type EvDbSpanName =
  | "eventualize.stream.get"
  | "eventualize.stream.append"
  | "eventualize.stream.store"
  | "eventualize.stream.goToOffset"
  | "eventualize.stream.clone"
  | "eventualize.adapter.store"
  | "eventualize.adapter.query.stream";

/** A group of spans, selected by its name prefix. */
export type EvDbSpanGroup = "eventualize.stream.*" | "eventualize.adapter.*";

/** Selects spans: one span name, a group, or `"*"` for all spans. */
export type EvDbSpanSelector = EvDbSpanName | EvDbSpanGroup | "*";

/** On/off state of every span. */
export type EvDbSpanPolicy = Readonly<Record<EvDbSpanName, boolean>>;

/** Telemetry options of a stream factory (`StreamFactoryBuilder.withTelemetry`). */
export interface EvDbTelemetryOptions {
  /**
   * Turns spans on (`true`) or off (`false`). Spans that no selector matches
   * keep their `EVDB_DEFAULT_SPANS` value. When several selectors match a span,
   * the most specific wins: exact name, then group, then `"*"`.
   */
  readonly spans?: Readonly<Partial<Record<EvDbSpanSelector, boolean>>>;
}

/**
 * Spans produced when a factory has no telemetry options.
 * `eventualize.stream.append` (one span per event) and the adapter spans are
 * off, to keep traces small.
 */
export const EVDB_DEFAULT_SPANS: EvDbSpanPolicy = Object.freeze({
  "eventualize.stream.get": true,
  "eventualize.stream.append": false,
  "eventualize.stream.store": true,
  "eventualize.stream.goToOffset": true,
  "eventualize.stream.clone": true,
  "eventualize.adapter.store": false,
  "eventualize.adapter.query.stream": false,
});

const SPAN_GROUP: Readonly<Record<EvDbSpanName, EvDbSpanGroup>> = {
  "eventualize.stream.get": "eventualize.stream.*",
  "eventualize.stream.append": "eventualize.stream.*",
  "eventualize.stream.store": "eventualize.stream.*",
  "eventualize.stream.goToOffset": "eventualize.stream.*",
  "eventualize.stream.clone": "eventualize.stream.*",
  "eventualize.adapter.store": "eventualize.adapter.*",
  "eventualize.adapter.query.stream": "eventualize.adapter.*",
};

/**
 * Merges the options over `EVDB_DEFAULT_SPANS`.
 * @param options - The factory telemetry options. Omit them to get the defaults.
 * @returns The on/off state of every span.
 */
export function resolveEvDbSpanPolicy(options?: EvDbTelemetryOptions): EvDbSpanPolicy {
  const spans = options?.spans ?? {};
  const isOn = (name: EvDbSpanName): boolean =>
    spans[name] ?? spans[SPAN_GROUP[name]] ?? spans["*"] ?? EVDB_DEFAULT_SPANS[name];
  return Object.freeze({
    "eventualize.stream.get": isOn("eventualize.stream.get"),
    "eventualize.stream.append": isOn("eventualize.stream.append"),
    "eventualize.stream.store": isOn("eventualize.stream.store"),
    "eventualize.stream.goToOffset": isOn("eventualize.stream.goToOffset"),
    "eventualize.stream.clone": isOn("eventualize.stream.clone"),
    "eventualize.adapter.store": isOn("eventualize.adapter.store"),
    "eventualize.adapter.query.stream": isOn("eventualize.adapter.query.stream"),
  });
}

// Wrapping the policy lets `instanceof` check a context value without a cast.
class SpanPolicyEntry {
  constructor(readonly policy: EvDbSpanPolicy) {}
}

const SPAN_POLICY_KEY = createContextKey("eventualize.span-policy");

/**
 * Returns a copy of `ctx` that carries `policy`. Core sets it around storage
 * adapter calls, so the adapters follow the factory's policy.
 */
export function setEvDbSpanPolicy(ctx: Context, policy: EvDbSpanPolicy): Context {
  return ctx.setValue(SPAN_POLICY_KEY, new SpanPolicyEntry(policy));
}

/** The policy that `ctx` carries, or `EVDB_DEFAULT_SPANS` when it carries none. */
export function getEvDbSpanPolicy(ctx: Context): EvDbSpanPolicy {
  const entry = ctx.getValue(SPAN_POLICY_KEY);
  return entry instanceof SpanPolicyEntry ? entry.policy : EVDB_DEFAULT_SPANS;
}

/** `true` when the policy of `ctx` (default: the active context) turns `spanName` on. */
export function isEvDbSpanEnabled(
  spanName: EvDbSpanName,
  ctx: Context = context.active(),
): boolean {
  return getEvDbSpanPolicy(ctx)[spanName];
}

// A provider without a delegate returns the API's no-op tracer.
const NOOP_TRACER = new ProxyTracerProvider().getTracer("@eventualize/disabled");

/**
 * Returns `tracer` when the policy of `ctx` (default: the active context)
 * turns `spanName` on, and a no-op tracer when it is off. A no-op span passes
 * on the caller's span context, so spans made inside it keep the caller's span
 * as their parent.
 * Storage adapters use it, so they follow the policy that core puts in the context.
 */
export function evDbTracerFor(
  spanName: EvDbSpanName,
  tracer: Tracer,
  ctx: Context = context.active(),
): Tracer {
  return isEvDbSpanEnabled(spanName, ctx) ? tracer : NOOP_TRACER;
}
