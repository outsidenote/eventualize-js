import { NodeSDK, type NodeSDKConfiguration } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "e2e-funds",
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
  }) as unknown as NodeSDKConfiguration["traceExporter"],
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log("[OTEL] SDK started — traces → " + (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318"));

process.on("SIGTERM", () => { sdk.shutdown().catch(console.error); });
process.on("SIGINT", () => { sdk.shutdown().catch(console.error); });
