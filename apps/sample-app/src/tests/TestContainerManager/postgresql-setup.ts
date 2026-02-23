import pg from "pg";

const POSTGRES_SCHEMA_SQL = `
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

CREATE INDEX IF NOT EXISTS ix_event_7ae7ea3b165349e09b3fe6d66a69fd72 ON events (stream_type, stream_id, "offset");
CREATE INDEX IF NOT EXISTS ix_event_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72 ON events (stored_at);

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

CREATE INDEX IF NOT EXISTS ix_outbox_7ae7ea3b165349e09b3fe6d66a69fd72 ON outbox (stream_type, stream_id, "offset", channel, message_type);
CREATE INDEX IF NOT EXISTS ix_storedat_outbox_captured_at_7ae7ea3b165349e09b3fe6d66a69fd72 ON outbox (stored_at, channel, message_type, "offset");

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

CREATE INDEX IF NOT EXISTS ix_snapshot_earlier_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72 ON snapshot (stream_type, stream_id, view_name, stored_at);
`;

export async function createPostgresSchema(connectionUri: string): Promise<void> {
  console.log("Creating PostgreSQL schema tables...");
  const client = new pg.Client({ connectionString: connectionUri });
  try {
    await client.connect();
    await client.query(POSTGRES_SCHEMA_SQL);
    console.log("✓ PostgreSQL schema created successfully");
  } catch (error: any) {
    console.error(`✗ Failed to create PostgreSQL schema: ${error.message}`);
    throw error;
  } finally {
    await client.end();
  }
}
