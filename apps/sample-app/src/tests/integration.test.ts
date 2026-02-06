import * as assert from 'node:assert';
import { test, describe } from 'node:test'; // Use require or import
import Steps, { EVENT_STORE_TYPE } from './steps.js';

const supportedRelationalDatabases = [EVENT_STORE_TYPE.MYSQL, EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.DYNAMODB];

describe('Relational Databases Integration Tests', () => {
  for (const storeType of supportedRelationalDatabases) {
    test(`${storeType} execution`, async t => {
      const testData: any = {};

      await t.before(async () => {
        testData.storeClient = Steps.createStoreClient(storeType)
        testData.eventStore = Steps.createEventStore(testData.storeClient, storeType);
        await Steps.clearEnvironment(testData.storeClient, storeType);
      })

      t.test('Given: local stream with events', () => {
        testData.streamId = 'pointsStream1';
        testData.pointsStream = Steps.createPointsStream(testData.streamId, testData.eventStore);
        Steps.addPointsEventsToStream(testData.pointsStream);
        Steps.assertStreamStateIsCorrect(testData.pointsStream)
      })

      t.test('When: stream stored and fetched', async () => {
        await assert.doesNotReject(testData.pointsStream.store());
        testData.fetchedStream = await testData.eventStore.getStream("PointsStream", testData.streamId);
      })

      t.test('Then: fetched stream is correct', async () => {
        Steps.compareFetchedAndStoredStreams(testData.pointsStream, testData.fetchedStream);
      })

      t.test('AND: Duplicate stream cannot be stored', async () => {
        testData.dupPointsStream = Steps.createPointsStream(testData.streamId, testData.eventStore);
        Steps.addPointsEventsToStream(testData.dupPointsStream);
        await assert.rejects(testData.dupPointsStream.store(), { message: 'OPTIMISTIC_CONCURRENCY_VIOLATION' });
      })

      t.test('Race condition is handled correctly', async () => {
        testData.fetchedStream1 = await testData.eventStore.getStream("PointsStream", testData.streamId);
        testData.fetchedStream2 = await testData.eventStore.getStream("PointsStream", testData.streamId);
        Steps.addPointsEventsToStream(testData.fetchedStream1);
        Steps.addPointsEventsToStream(testData.fetchedStream2);
        const results = await Promise.allSettled([testData.fetchedStream1.store(), testData.fetchedStream2.store()])
        assert.strictEqual(results.filter(r => r.status === 'fulfilled').length, 1);
        assert.strictEqual(results.filter(r => r.status === 'rejected').length, 1);
      })

      t.after(async () => {
        await Steps.clearEnvironment(testData.storeClient, storeType);
      })
    });
  }
})
