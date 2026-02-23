import mysql from "mysql2/promise";

// MySQL schema SQL - split into individual statements (MySQL doesn't support multi-statement by default)
const MYSQL_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS events (
        id CHAR(36) NOT NULL,
        stream_type VARCHAR(150) NOT NULL,
        stream_id VARCHAR(150) NOT NULL,
        \`offset\` BIGINT NOT NULL,
        event_type VARCHAR(150) NOT NULL,
        telemetry_context JSON,
        captured_by VARCHAR(150) NOT NULL,
        captured_at DATETIME(3) NOT NULL,
        stored_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        payload JSON NOT NULL,
        PRIMARY KEY (stream_type, stream_id, \`offset\`),
        INDEX ix_event_7ae7ea3b165349e09b3fe6d66a69fd72 (stream_type, stream_id, \`offset\`),
        INDEX ix_event_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72 (stored_at)
    )`,
  `CREATE TABLE IF NOT EXISTS outbox (
        id CHAR(36) NOT NULL,
        stream_type VARCHAR(150) NOT NULL,
        stream_id VARCHAR(150) NOT NULL,
        \`offset\` BIGINT NOT NULL,
        event_type VARCHAR(150) NOT NULL,
        channel VARCHAR(150) NOT NULL,
        message_type VARCHAR(150) NOT NULL,
        serialize_type VARCHAR(150) NOT NULL,
        telemetry_context LONGBLOB,
        captured_by VARCHAR(150) NOT NULL,
        captured_at DATETIME(3) NOT NULL,
        stored_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        payload JSON NOT NULL,
        PRIMARY KEY (captured_at, stream_type, stream_id, \`offset\`, channel, message_type),
        INDEX ix_outbox_7ae7ea3b165349e09b3fe6d66a69fd72 (stream_type, stream_id, \`offset\`, channel, message_type),
        INDEX ix_storedat_outbox_captured_at_7ae7ea3b165349e09b3fe6d66a69fd72 (stored_at, channel, message_type, \`offset\`)
    )`,
  `CREATE TABLE IF NOT EXISTS snapshot (
        id CHAR(36) NOT NULL,
        stream_type VARCHAR(150) NOT NULL,
        stream_id VARCHAR(150) NOT NULL,
        view_name VARCHAR(150) NOT NULL,
        \`offset\` BIGINT NOT NULL,
        state JSON NOT NULL,
        stored_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (stream_type, stream_id, view_name, \`offset\`),
        INDEX ix_snapshot_earlier_stored_at_7ae7ea3b165349e09b3fe6d66a69fd72 (stream_type, stream_id, view_name, stored_at)
    )`,
];

export async function createMysqlSchema(connectionUri: string): Promise<void> {
  console.log("Creating MySQL schema tables...");
  // Parse the mariadb:// URL to mysql:// format for mysql2
  const url = new URL(connectionUri.replace("mariadb://", "mysql://"));
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port, 10),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  });
  try {
    for (const statement of MYSQL_SCHEMA_STATEMENTS) {
      await connection.query(statement);
    }
    console.log("✓ MySQL schema created successfully");
  } catch (error: any) {
    console.error(`✗ Failed to create MySQL schema: ${error.message}`);
    throw error;
  } finally {
    await connection.end();
  }
}
