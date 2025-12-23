import * as assert from 'node:assert';
import { test, describe } from 'node:test'; // Use require or import
import Steps, { EVENT_STORE_TYPE } from './steps.js';
import { PointsStreamType } from '../eventstore/PointsStream/index.js';

const supportedRelationalDatabases = [EVENT_STORE_TYPE.MYSQL, EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.DYNAMODB];

describe('Relational Databases Integration Tests', () => {
  for (const storeType of supportedRelationalDatabases) {
    test(`${storeType} execution`, async t => {
      const testData: any = {};
      t.before(async () => {
        testData.storeClient = Steps.createStoreClient(storeType)
        testData.eventStore = Steps.createEventStore(testData.storeClient, storeType);
        await Steps.clearEnvironment(testData.storeClient, storeType);
      })

      t.test('Given: local stream with events', () => {
        testData.streamId = 'pointsStream1';
        testData.pointsStream = Steps.createPointsStream(testData.streamId, testData.eventStore);
        Steps.addPointsEventsToStream(testData.pointsStream);
      })

      t.test('When: stream stored and fetched', async () => {
        await assert.doesNotReject(testData.pointsStream.store());
        testData.fetchedStream = await testData.eventStore.getStream("PointsStream", testData.streamId);
      })

      t.test('Then: fetched stream is correct', async () => {
        Steps.compareFetchedAndStoredStreams(testData.pointsStream, testData.fetchedStream);
      })
      t.after(async () => {
        await Steps.clearEnvironment(testData.storeClient, storeType);
      })
    });
  }
})
