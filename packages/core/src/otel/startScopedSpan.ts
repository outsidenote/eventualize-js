import type { Span, Tracer, Attributes } from "@opentelemetry/api";

/**
 * A disposable span for use with TypeScript's `using` keyword.
 *
 * Ends the span when the scope exits. Error state management is the
 * caller's responsibility — use withSpan() for automatic OK/ERROR handling.
 */
export interface IDisposableSpan {
  readonly span: Span;
  [Symbol.dispose](): void;
}

/**
 * Start a scoped span for use with TypeScript's `using` declaration.
 *
 * @example
 * async function processOrder(orderId: string) {
 *   using scope = startScopedSpan(tracer, "order.process", { orderId });
 *   const order = await fetchOrder(orderId);
 *   scope.span.setAttribute("total", order.total);
 *   return await processPayment(order);
 * }
 */
export function startScopedSpan(
  tracer: Tracer,
  spanName: string,
  attributes?: Attributes,
): IDisposableSpan {
  const span = tracer.startSpan(spanName, { attributes });

  return {
    span,
    [Symbol.dispose]() {
      span.end();
    },
  };
}
