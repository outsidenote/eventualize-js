// Constants + info helper
export { EVDB_TRACER_NAMES, eventualizeInstrumentation } from "./tracers.js";

// Optional utilities for user code
export { withSpan } from "./withSpan.js";
export { startScopedSpan, type IDisposableSpan } from "./startScopedSpan.js";

// Tracer accessors (for advanced users / custom integration)
export {
  getCoreTracer,
  getRelationalAdapterTracer,
  getDynamoDbAdapterTracer,
  getMySqlAdapterTracer,
  getPostgresAdapterTracer,
} from "./tracers.js";
