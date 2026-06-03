// otel MUST be the very first import so the SDK patches pg/http before any other code runs
import "./otel.js";

import { trace, SpanStatusCode } from "@opentelemetry/api";
import pg from "pg";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import FundsEventsAndViewsStreamFactory from "../../sample-app/dist/eventstore/FundsStream/FundsEventsAndViewsStreamFactory.js";

const POSTGRES_URI =
  process.env.POSTGRES_CONNECTION ?? "postgres://evdb:evdbpassword@localhost:5432/evdb_test";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events (
    id UUID NOT NULL,
    stream_type VARCHAR(150) NOT NULL,
    stream_id VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    event_type VARCHAR(150) NOT NULL,
    telemetry_context JSON,
    captured_by VARCHAR(150) NOT NULL,
    captured_at TIMESTAMPTZ(6) NOT NULL,
    stored_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    payload JSON NOT NULL,
    PRIMARY KEY (stream_type, stream_id, "offset")
);

CREATE INDEX IF NOT EXISTS ix_event_otel_sample ON events (stream_type, stream_id, "offset");
CREATE INDEX IF NOT EXISTS ix_event_stored_at_otel_sample ON events (stored_at);

CREATE TABLE IF NOT EXISTS outbox (
    id UUID NOT NULL,
    stream_type VARCHAR(150) NOT NULL,
    stream_id VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    event_type VARCHAR(150) NOT NULL,
    channel VARCHAR(150) NOT NULL,
    message_type VARCHAR(150) NOT NULL,
    serialize_type VARCHAR(150) NOT NULL,
    telemetry_context BYTEA,
    captured_by VARCHAR(150) NOT NULL,
    captured_at TIMESTAMPTZ(6) NOT NULL,
    stored_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    payload JSON NOT NULL,
    PRIMARY KEY (captured_at, stream_type, stream_id, "offset", channel, message_type)
);

CREATE TABLE IF NOT EXISTS snapshot (
    id UUID NOT NULL,
    stream_type VARCHAR(150) NOT NULL,
    stream_id VARCHAR(150) NOT NULL,
    view_name VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    state JSON NOT NULL,
    stored_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    PRIMARY KEY (stream_type, stream_id, view_name, "offset")
);
`;

async function ensureSchema(): Promise<void> {
  const client = new pg.Client({ connectionString: POSTGRES_URI });
  await client.connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log("[setup] schema tables created/verified");
  } finally {
    await client.end();
  }
}

async function appendFundsEvents(): Promise<void> {
  const tracer = trace.getTracer("otel-sample-app");

  return tracer.startActiveSpan("appendFundsEvents", async (rootSpan) => {
    try {
      const storeClient = EvDbPostgresPrismaClientFactory.create(POSTGRES_URI);
      const adapter = new EvDbPrismaStorageAdapter(storeClient);

      const streamId = `demo-account-${Date.now()}`;
      const stream = FundsEventsAndViewsStreamFactory.create(streamId, adapter, adapter);

      // Append a realistic sequence of fund events within a child span each
      await tracer.startActiveSpan("deposit-500", async (span) => {
        stream.appendEventFundsDeposited({ amount: 500, Currency: "USD" });
        span.setAttribute("event.type", "FundsDeposited");
        span.setAttribute("amount", 500);
        span.end();
      });

      await tracer.startActiveSpan("capture-200", async (span) => {
        stream.appendEventFundsCaptured({ amount: 200, Currency: "USD" });
        span.setAttribute("event.type", "FundsCaptured");
        span.setAttribute("amount", 200);
        span.end();
      });

      await tracer.startActiveSpan("refund-50", async (span) => {
        stream.appendEventFundsRefunded({ amount: 50, Currency: "USD" });
        span.setAttribute("event.type", "FundsRefunded");
        span.setAttribute("amount", 50);
        span.end();
      });

      await tracer.startActiveSpan("withdrawal-100", async (span) => {
        stream.appendEventFundsWithdrawal({ amount: 100, Currency: "USD" });
        span.setAttribute("event.type", "FundsWithdrawal");
        span.setAttribute("amount", 100);
        span.end();
      });

      await tracer.startActiveSpan("store-stream", async (span) => {
        span.setAttribute("stream.id", streamId);
        span.setAttribute("stream.event_count", stream.getEvents().length);
        await stream.store();
        span.end();
      });

      const balance = stream.views.balance;
      const counts = Object.fromEntries(stream.views.count);
      console.log(`[done] streamId=${streamId} balance=${balance}`, counts);
      rootSpan.setAttribute("stream.id", streamId);
      rootSpan.setAttribute("stream.balance", balance);
      rootSpan.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      rootSpan.end();
    }
  });
}

async function main(): Promise<void> {
  console.log(`[start] connecting to ${POSTGRES_URI}`);
  await ensureSchema();
  await appendFundsEvents();
  console.log("[done] all events stored — check Aspire Dashboard at http://localhost:18888");

  // Flush OTEL exporters before process exits (the SDK shutdown is registered on SIGINT/SIGTERM).
  // Give the BatchSpanProcessor ~3 s to flush the last batch.
  await new Promise((r) => setTimeout(r, 3_000));
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
