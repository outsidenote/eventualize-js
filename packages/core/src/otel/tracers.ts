import { trace } from "@opentelemetry/api";
import type { Tracer } from "@opentelemetry/api";

const EVDB_VERSION = "6.0.0";

/**
 * Tracer names used by eventualize-js packages.
 * Exposed for documentation, custom sampling, and debugging.
 */
export const EVDB_TRACER_NAMES = {
  CORE: "@eventualize/core",
  ADAPTER_RELATIONAL: "@eventualize/relational-adapter",
  ADAPTER_DYNAMODB: "@eventualize/dynamodb-adapter",
  ADAPTER_MYSQL: "@eventualize/mysql-adapter",
  ADAPTER_POSTGRES: "@eventualize/postgres-adapter",
} as const;

/**
 * Returns metadata about Eventualize instrumentation.
 * Use when configuring your OTEL SDK to apply resource attributes
 * or to filter spans by tracer name.
 */
export function eventualizeInstrumentation(): {
  tracerNames: string[];
  resourceAttributes: Record<string, string>;
} {
  return {
    tracerNames: Object.values(EVDB_TRACER_NAMES),
    resourceAttributes: {
      "eventualize.sdk.version": EVDB_VERSION,
      "eventualize.sdk.language": "typescript",
    },
  };
}

export function getCoreTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.CORE, EVDB_VERSION);
}

export function getRelationalAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_RELATIONAL, EVDB_VERSION);
}

export function getDynamoDbAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_DYNAMODB, EVDB_VERSION);
}

export function getMySqlAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_MYSQL, EVDB_VERSION);
}

export function getPostgresAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_POSTGRES, EVDB_VERSION);
}
