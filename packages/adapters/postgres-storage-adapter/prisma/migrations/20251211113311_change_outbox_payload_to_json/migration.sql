-- CreateTable
CREATE TABLE "events" (
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

-- CreateTable
CREATE TABLE "outbox" (
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

-- CreateTable
CREATE TABLE "snapshot" (
    "id" UUID NOT NULL,
    "stream_type" VARCHAR(150) NOT NULL,
    "stream_id" VARCHAR(150) NOT NULL,
    "view_name" VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    "state" JSON NOT NULL,
    "stored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_pkey" PRIMARY KEY ("stream_type","stream_id","view_name","offset")
);

-- CreateIndex
CREATE INDEX "ix_event_7ae7ea3b165349e09b3fe6d66a69fd72" ON "events"("stream_type", "stream_id", "offset");

-- CreateIndex
CREATE INDEX "ix_event_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72" ON "events"("stored_at");

-- CreateIndex
CREATE INDEX "ix_outbox_7ae7ea3b165349e09b3fe6d66a69fd72" ON "outbox"("stream_type", "stream_id", "offset", "channel", "message_type");

-- CreateIndex
CREATE INDEX "ix_storedat_outbox_captured_at_7ae7ea3b165349e09b3fe6d66a69fd72" ON "outbox"("stored_at", "channel", "message_type", "offset");

-- CreateIndex
CREATE INDEX "ix_snapshot_earlier_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72" ON "snapshot"("stream_type", "stream_id", "view_name", "stored_at");
