import * as assert from 'node:assert';
import { test, describe } from 'node:test'; // Use require or import
import Steps, { EVENT_STORE_TYPE } from './steps.js';


describe('Postgres Tests', () => {
  test('Postgres execution', async t => {
    const testData: any = {};
    t.test('Given: local stream with events', () => {
      testData.streamId = 'pointsStream1';
      testData.eventStore = Steps.createEventStore(EVENT_STORE_TYPE.POSTGRES);
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
      await Steps.clearEnvironment(testData.eventStore, EVENT_STORE_TYPE.POSTGRES);
    })
  });
})