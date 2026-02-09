import * as assert from 'node:assert';
import { test, describe, before, after } from 'node:test';
import Steps, { EVENT_STORE_TYPE } from './steps.js';
import { TestContainerManager } from './TestContainerManager/index.js';
import { startSupportedDatabases } from './testInit.js';

// Start containers before all tests

describe('Database Integration Tests', () => {
  let containerManager: TestContainerManager;
  before(async () => {
    containerManager = await startSupportedDatabases();
  });

  // Stop containers after all tests
  after(async () => {
    console.log('\n=== Stopping test containers ===\n');
    await containerManager.stopAll();
  });

  test('start integration tests', async () => {
    for (const storeType of containerManager.supportedDatabases) {
      await test(`${storeType} execution`, async t => {
        const testData: any = {};

        await t.before(async () => {
          const connectionConfig = containerManager.getConnection(storeType);
          if (storeType !== EVENT_STORE_TYPE.DYNAMODB) {
            testData.storeClient = Steps.createStoreClient(storeType, connectionConfig as string | undefined);
          }
          const dynamoDbOptions = containerManager.getDynamoDbOptions();
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
          await Steps.clearEnvironment(testData.storeClient, storeType, containerManager.getDynamoDbOptions());
        });
      });
    }

  });

});
