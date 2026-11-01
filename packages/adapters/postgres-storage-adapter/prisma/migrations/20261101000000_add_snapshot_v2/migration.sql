-- CreateTable
CREATE TABLE "snapshot_v2" (
    "id" UUID NOT NULL,
    "stream_type" VARCHAR(150) NOT NULL,
    "stream_id" VARCHAR(150) NOT NULL,
    "view_name" VARCHAR(150) NOT NULL,
    "offset" BIGINT NOT NULL,
    "state" JSON,
    "state_offset" BIGINT,
    "stored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_v2_pkey" PRIMARY KEY ("stream_type","stream_id","view_name","offset")
);

-- CreateIndex
CREATE INDEX "ix_snapshot_v2_stored_at" ON "snapshot_v2"("stream_type", "stream_id", "view_name", "stored_at");
