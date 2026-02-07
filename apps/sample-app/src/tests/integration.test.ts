import * as assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import Steps, { EVENT_STORE_TYPE, DynamoDBClientOptions } from './steps.js';
import { TestContainerManager, DynamoDBConfig } from './test-containers.js';
import { setupDynamoDBTables } from './dynamodb-setup.js';

// Container manager instance - shared across all tests
const containerManager = new TestContainerManager();

// Connection strings populated by testcontainers
let postgresConnectionString: string | undefined;
let mysqlConnectionString: string | undefined;
let dynamoDbConfig: DynamoDBConfig | undefined;

// Parse TEST_DATABASES environment variable (comma-separated list of database names)
// Defaults to all databases if not specified
const getTestedDatabases = (): EVENT_STORE_TYPE[] => {
  const testDatabases = process.env.TEST_DATABASES;
  if (!testDatabases) {
    return [EVENT_STORE_TYPE.MYSQL, EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.DYNAMODB];
  }

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

const supportedDatabases = getTestedDatabases();

/**
 * Gets the connection string for the specified database type.
 */
const getConnectionString = (storeType: EVENT_STORE_TYPE): string | undefined => {
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
const getDynamoDbOptions = (): DynamoDBClientOptions | undefined => {
  if (!dynamoDbConfig) return undefined;
  return {
    endpoint: dynamoDbConfig.endpoint,
    accessKeyId: dynamoDbConfig.accessKeyId,
    secretAccessKey: dynamoDbConfig.secretAccessKey,
    region: dynamoDbConfig.region,
  };
};

// Start containers before all tests
before(async () => {
  console.log('\n=== Starting test containers ===\n');

  const startPromises: Promise<void>[] = [];

  if (supportedDatabases.includes(EVENT_STORE_TYPE.POSTGRES)) {
    startPromises.push(
      containerManager.startPostgres().then(uri => {
        postgresConnectionString = uri;
      })
    );
  }

  if (supportedDatabases.includes(EVENT_STORE_TYPE.MYSQL)) {
    startPromises.push(
      containerManager.startMySql().then(uri => {
        mysqlConnectionString = uri;
      })
    );
  }

  if (supportedDatabases.includes(EVENT_STORE_TYPE.DYNAMODB)) {
    startPromises.push(
      containerManager.startDynamoDB().then(async config => {
        dynamoDbConfig = config;
        // Create DynamoDB tables after container is ready
        await setupDynamoDBTables(config);
      })
    );
  }

  await Promise.all(startPromises);
  console.log('\n=== All containers started ===\n');
});

// Stop containers after all tests
after(async () => {
  console.log('\n=== Stopping test containers ===\n');
  await containerManager.stopAll();
});

describe('Database Integration Tests', () => {
  for (const storeType of supportedDatabases) {
    test(`${storeType} execution`, async t => {
      const testData: any = {};
      const connectionString = getConnectionString(storeType);
      const dynamoDbOptions = getDynamoDbOptions();

      await t.before(async () => {
        testData.storeClient = Steps.createStoreClient(storeType, connectionString);
        testData.eventStore = Steps.createEventStore(testData.storeClient, storeType, dynamoDbOptions);
        await Steps.clearEnvironment(testData.storeClient, storeType, dynamoDbOptions);
      });

      t.test('Given: local stream with events', () => {
        testData.streamId = 'pointsStream1';
        testData.pointsStream = Steps.createPointsStream(testData.streamId, testData.eventStore);
        Steps.addPointsEventsToStream(testData.pointsStream);
        Steps.assertStreamStateIsCorrect(testData.pointsStream);
      });

      t.test('When: stream stored and fetched', async () => {
        await assert.doesNotReject(testData.pointsStream.store());
        testData.fetchedStream = await testData.eventStore.getStream("PointsStream", testData.streamId);
      });

      t.test('Then: fetched stream is correct', async () => {
        Steps.compareFetchedAndStoredStreams(testData.pointsStream, testData.fetchedStream);
      });

      t.test('AND: Duplicate stream cannot be stored', async () => {
        testData.dupPointsStream = Steps.createPointsStream(testData.streamId, testData.eventStore);
        Steps.addPointsEventsToStream(testData.dupPointsStream);
        await assert.rejects(testData.dupPointsStream.store(), { message: 'OPTIMISTIC_CONCURRENCY_VIOLATION' });
      });

      t.test('Race condition is handled correctly', async () => {
        testData.fetchedStream1 = await testData.eventStore.getStream("PointsStream", testData.streamId);
        testData.fetchedStream2 = await testData.eventStore.getStream("PointsStream", testData.streamId);
        Steps.addPointsEventsToStream(testData.fetchedStream1);
        Steps.addPointsEventsToStream(testData.fetchedStream2);
        const results = await Promise.allSettled([testData.fetchedStream1.store(), testData.fetchedStream2.store()]);
        assert.strictEqual(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.strictEqual(results.filter(r => r.status === 'rejected').length, 1);
      });

      t.after(async () => {
        await Steps.clearEnvironment(testData.storeClient, storeType, dynamoDbOptions);
      });
    });
  }
});
