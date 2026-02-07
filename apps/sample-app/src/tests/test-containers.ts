import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { LocalstackContainer, StartedLocalstackContainer } from '@testcontainers/localstack';
import pg from 'pg';
import mysql from 'mysql2/promise';

export interface DynamoDBConfig {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

// PostgreSQL schema SQL (derived from Prisma schema)
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
    )`
];

/**
 * Creates PostgreSQL schema tables using the pg driver.
 */
async function createPostgresSchema(connectionUri: string): Promise<void> {
    console.log('Creating PostgreSQL schema tables...');
    const client = new pg.Client({ connectionString: connectionUri });
    try {
        await client.connect();
        await client.query(POSTGRES_SCHEMA_SQL);
        console.log('✓ PostgreSQL schema created successfully');
    } catch (error: any) {
        console.error(`✗ Failed to create PostgreSQL schema: ${error.message}`);
        throw error;
    } finally {
        await client.end();
    }
}

/**
 * Creates MySQL schema tables using the mysql2 driver.
 */
async function createMysqlSchema(connectionUri: string): Promise<void> {
    console.log('Creating MySQL schema tables...');
    // Parse the mariadb:// URL to mysql:// format for mysql2
    const url = new URL(connectionUri.replace('mariadb://', 'mysql://'));
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
        console.log('✓ MySQL schema created successfully');
    } catch (error: any) {
        console.error(`✗ Failed to create MySQL schema: ${error.message}`);
        throw error;
    } finally {
        await connection.end();
    }
}

/**
 * Manages test container lifecycle for integration tests.
 * Provides methods to start/stop database containers dynamically.
 */
export class TestContainerManager {
    private postgresContainer?: StartedPostgreSqlContainer;
    private mysqlContainer?: StartedMySqlContainer;
    private localstackContainer?: StartedLocalstackContainer;

    /**
     * Starts a PostgreSQL container, runs schema migration, and returns the connection URI.
     * Uses the same database name, user, and password as docker-compose setup.
     */
    async startPostgres(): Promise<string> {
        console.log('Starting PostgreSQL container...');
        this.postgresContainer = await new PostgreSqlContainer('postgres:18.1')
            .withDatabase('evdb_test')
            .withUsername('evdb')
            .withPassword('evdbpassword')
            .start();

        const connectionUri = this.postgresContainer.getConnectionUri();
        console.log(`PostgreSQL container started at: ${connectionUri}`);

        // Create schema tables
        await createPostgresSchema(connectionUri);

        return connectionUri;
    }

    /**
     * Starts a MySQL container, runs schema migration, and returns the connection URI.
     * Uses MariaDB protocol prefix for compatibility with Prisma adapter.
     */
    async startMySql(): Promise<string> {
        console.log('Starting MySQL container...');
        this.mysqlContainer = await new MySqlContainer('mysql:9.0')
            .withDatabase('evdb_test')
            .withUsername('evdb')
            .withRootPassword('rootpassword')
            .withUserPassword('evdbpassword')
            .start();

        // Get connection details and construct mariadb:// URI for Prisma MariaDB adapter
        const host = this.mysqlContainer.getHost();
        const port = this.mysqlContainer.getPort();
        const connectionUri = `mariadb://evdb:evdbpassword@${host}:${port}/evdb_test`;
        console.log(`MySQL container started at: ${connectionUri}`);

        // Create schema tables
        await createMysqlSchema(connectionUri);

        return connectionUri;
    }

    /**
     * Starts a LocalStack container with DynamoDB service.
     * Returns configuration needed to connect to DynamoDB.
     */
    async startDynamoDB(): Promise<DynamoDBConfig> {
        console.log('Starting LocalStack (DynamoDB) container...');
        // LocalStack starts all services by default, no need for withServices
        this.localstackContainer = await new LocalstackContainer('localstack/localstack:3.8')
            .start();

        const endpoint = this.localstackContainer.getConnectionUri();
        const config: DynamoDBConfig = {
            endpoint,
            accessKeyId: 'test',
            secretAccessKey: 'test',
            region: 'us-east-1',
        };
        console.log(`LocalStack (DynamoDB) container started at: ${endpoint}`);
        return config;
    }

    /**
     * Stops all running containers.
     */
    async stopAll(): Promise<void> {
        const stopPromises: Promise<void>[] = [];

        if (this.postgresContainer) {
            console.log('Stopping PostgreSQL container...');
            stopPromises.push(this.postgresContainer.stop());
        }

        if (this.mysqlContainer) {
            console.log('Stopping MySQL container...');
            stopPromises.push(this.mysqlContainer.stop());
        }

        if (this.localstackContainer) {
            console.log('Stopping LocalStack container...');
            stopPromises.push(this.localstackContainer.stop());
        }

        await Promise.all(stopPromises);
        console.log('All containers stopped.');
    }
}
