import { TestContainerManager, DynamoDBConfig } from './TestContainerManager/index.js';
import Steps, { EVENT_STORE_TYPE, DynamoDBClientOptions } from './steps.js';

// Connection strings populated by testcontainers
let postgresConnectionString: string | undefined;
let mysqlConnectionString: string | undefined;
let dynamoDbConfig: DynamoDBConfig | undefined;

export const getTestedDatabases = (): EVENT_STORE_TYPE[] => {
    if (!process.env.TEST_DATABASES) {
        return [EVENT_STORE_TYPE.MYSQL, EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.DYNAMODB];
    }

    const testDatabases = process.env.TEST_DATABASES;
    const databases = testDatabases.split(',').map(db => db.trim());
    const mapping: Record<string, EVENT_STORE_TYPE> = {
        'MySQL': EVENT_STORE_TYPE.MYSQL,
        'Postgres': EVENT_STORE_TYPE.POSTGRES,
        'DynamoDB': EVENT_STORE_TYPE.DYNAMODB,
    };

    return databases
        .map(db => mapping[db])
        .filter((db): db is EVENT_STORE_TYPE => db !== undefined);
};

/**
 * Gets the connection string for the specified database type.
 */
export const getConnectionString = (storeType: EVENT_STORE_TYPE): string | undefined => {
    switch (storeType) {
        case EVENT_STORE_TYPE.POSTGRES:
            return postgresConnectionString;
        case EVENT_STORE_TYPE.MYSQL:
            return mysqlConnectionString;
        default:
            return undefined;
    }
};

/**
 * Gets the DynamoDB options for testcontainers.
 */
export const getDynamoDbOptions = (): DynamoDBClientOptions | undefined => {
    if (!dynamoDbConfig) return undefined;
    return {
        endpoint: dynamoDbConfig.endpoint,
        accessKeyId: dynamoDbConfig.accessKeyId,
        secretAccessKey: dynamoDbConfig.secretAccessKey,
        region: dynamoDbConfig.region,
    };
};

// Container manager instance - shared across all tests

export async function startSupportedDatabases(): Promise<TestContainerManager> {
    const containerManager = new TestContainerManager();
    console.log('\n=== Starting test containers ===\n');
    const supportedDatabases = getTestedDatabases();
    await containerManager.startDatabases(supportedDatabases);
    console.log('\n=== All containers started ===\n');
    return containerManager;
}