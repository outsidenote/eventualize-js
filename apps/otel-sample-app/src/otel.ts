import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

// Default to OTel Collector from apps/e2e/funds/docker-compose.yml which fans out to Aspire Dashboard.
// Override with OTEL_EXPORTER_OTLP_ENDPOINT to point at a different backend.
const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "otel-sample-app",
  traceExporter: new OTLPTraceExporter({ url: `${otlpBase}/v1/traces` }),
  metricReaders: [new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${otlpBase}/v1/metrics` }),
    exportIntervalMillis: 10_000,
  })],
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${otlpBase}/v1/logs` }))],
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Bridge console → OTel Logs so messages appear in Aspire Dashboard structured log view
const logger = logs.getLogger("console");
const severityMap: Record<string, SeverityNumber> = {
  log: SeverityNumber.INFO,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  debug: SeverityNumber.DEBUG,
};
(["log", "info", "warn", "error", "debug"] as const).forEach((level) => {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    logger.emit({ severityNumber: severityMap[level], body: args.map(String).join(" ") });
  };
});

console.log(`[OTEL] SDK started — service=otel-sample-app traces/metrics/logs → ${otlpBase}`);

process.on("SIGTERM", () => { sdk.shutdown().catch(console.error); });
process.on("SIGINT", () => { sdk.shutdown().catch(console.error); });
