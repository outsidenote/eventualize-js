import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";

const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:18890";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "e2e-funds",
  traceExporter: new OTLPTraceExporter({ url: `${otlpBase}/v1/traces` }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${otlpBase}/v1/metrics` }),
    exportIntervalMillis: 10_000,
  }),
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${otlpBase}/v1/logs` }))],
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log(`[OTEL] SDK started — traces/metrics/logs → ${otlpBase}`);

process.on("SIGTERM", () => { sdk.shutdown().catch(console.error); });
process.on("SIGINT", () => { sdk.shutdown().catch(console.error); });
