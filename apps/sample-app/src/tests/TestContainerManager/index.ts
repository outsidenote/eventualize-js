import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { StoppedTestContainer } from 'testcontainers';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { LocalstackContainer, StartedLocalStackContainer } from '@testcontainers/localstack';
import { createPostgresSchema } from './postgresql-setup.js';
import { createMysqlSchema } from './mysql-setup.js';
import { setupDynamoDBTables } from './dynamodb-setup.js';
import { EVENT_STORE_TYPE } from '../steps.js';

export interface DynamoDBConfig {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

/**
 * Manages test container lifecycle for integration tests.
 * Provides methods to start/stop database containers dynamically.
 */
export class TestContainerManager {
    private postgresContainer?: StartedPostgreSqlContainer;
    private mysqlContainer?: StartedMySqlContainer;
    private localstackContainer?: StartedLocalStackContainer;
    private databases: EVENT_STORE_TYPE[] = [];
    private connections: Partial<Record<EVENT_STORE_TYPE, string | DynamoDBConfig>> = {};

    public get supportedDatabases(): EVENT_STORE_TYPE[] {
        return this.databases
    }

    public getConnection(storeType: EVENT_STORE_TYPE): string | DynamoDBConfig | undefined {
        return this.connections[storeType];
    }

    async startDatabases(databases: EVENT_STORE_TYPE[]): Promise<void> {
        const startPromises: Promise<void>[] = [];
        if (databases.includes(EVENT_STORE_TYPE.POSTGRES)) {
            startPromises.push(this.startPostgres().then(uri => {
                this.connections[EVENT_STORE_TYPE.POSTGRES] = uri;
            }));
        }

        if (databases.includes(EVENT_STORE_TYPE.MYSQL)) {
            startPromises.push(this.startMySql().then(uri => {
                this.connections[EVENT_STORE_TYPE.MYSQL] = uri;
            }));
        }

        if (databases.includes(EVENT_STORE_TYPE.DYNAMODB)) {
            startPromises.push(this.startDynamoDB().then(config => {
                this.connections[EVENT_STORE_TYPE.DYNAMODB] = config;
            }));
        }
        await Promise.all(startPromises);
        this.databases = Object.keys(this.connections) as EVENT_STORE_TYPE[];
    }

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

        await setupDynamoDBTables(config);
        return config;
    }

    /**
     * Stops all running containers.
     */
    async stopAll(): Promise<StoppedTestContainer[]> {
        const stopPromises: Promise<StoppedTestContainer>[] = [];

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

        const response = await Promise.all(stopPromises);
        console.log('All containers stopped.');
        return response
    }
}
