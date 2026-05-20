-- EvDb storage tables (mirrors packages/adapters/postgres-storage-adapter/prisma/migrations/*)
CREATE TABLE IF NOT EXISTS "events" (
    "id" UUID NOT NULL,
    "stream_type" VARCHAR(150) NOT NULL,
    "stream_id" VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "telemetry_context" JSON,
    "captured_by" VARCHAR(150) NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "stored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSON NOT NULL,
    CONSTRAINT "events_pkey" PRIMARY KEY ("stream_type","stream_id","offset")
);

CREATE INDEX IF NOT EXISTS "ix_event_7ae7ea3b165349e09b3fe6d66a69fd72"
    ON "events"("stream_type", "stream_id", "offset");

CREATE INDEX IF NOT EXISTS "ix_event_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72"
    ON "events"("stored_at");

CREATE TABLE IF NOT EXISTS "outbox" (
    "id" UUID NOT NULL,
    "stream_type" VARCHAR(150) NOT NULL,
    "stream_id" VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "channel" VARCHAR(150) NOT NULL,
    "message_type" VARCHAR(150) NOT NULL,
    "serialize_type" VARCHAR(150) NOT NULL,
    "telemetry_context" BYTEA,
    "captured_by" VARCHAR(150) NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "stored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSON NOT NULL,
    CONSTRAINT "outbox_pkey" PRIMARY KEY ("captured_at","stream_type","stream_id","offset","channel","message_type")
);

CREATE INDEX IF NOT EXISTS "ix_outbox_7ae7ea3b165349e09b3fe6d66a69fd72"
    ON "outbox"("stream_type", "stream_id", "offset", "channel", "message_type");

CREATE INDEX IF NOT EXISTS "ix_storedat_outbox_captured_at_7ae7ea3b165349e09b3fe6d66a69fd72"
    ON "outbox"("stored_at", "channel", "message_type", "offset");

CREATE TABLE IF NOT EXISTS "snapshot" (
    "id" UUID NOT NULL,
    "stream_type" VARCHAR(150) NOT NULL,
    "stream_id" VARCHAR(150) NOT NULL,
    "view_name" VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    "state" JSON NOT NULL,
    "stored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "snapshot_pkey" PRIMARY KEY ("stream_type","stream_id","view_name","offset")
);

CREATE INDEX IF NOT EXISTS "ix_snapshot_earlier_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72"
    ON "snapshot"("stream_type", "stream_id", "view_name", "stored_at");

-- Account leaderboard read model
CREATE TABLE IF NOT EXISTS account_leaderboard (
  account_id       TEXT PRIMARY KEY,
  currency         TEXT        NOT NULL DEFAULT 'USD',
  total_deposited  NUMERIC     NOT NULL DEFAULT 0,
  total_withdrawn  NUMERIC     NOT NULL DEFAULT 0,
  last_balance     NUMERIC     NOT NULL DEFAULT 0,
  deposit_count    INTEGER     NOT NULL DEFAULT 0,
  withdrawal_count INTEGER     NOT NULL DEFAULT 0,
  last_activity    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
