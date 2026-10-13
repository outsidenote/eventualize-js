import { SpanStatusCode } from "@opentelemetry/api";
import type { Span, Tracer, Attributes } from "@opentelemetry/api";

/**
 * Execute a function within an OTEL span with automatic lifecycle.
 *
 * Automatically sets status OK on success, ERROR + recordException on throw,
 * and always calls span.end().
 */
export async function withSpan<T>(
  tracer: Tracer,
  spanName: string,
  fn: (span: Span) => T | Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const err = error as Error;
      span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
      if (err instanceof Error) {
        span.recordException(err);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
