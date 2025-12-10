import * as assert from 'node:assert';
import { test, describe } from 'node:test'; // Use require or import
import Steps, { EVENT_STORE_TYPE } from './steps.js';


describe('Postgres Tests', () => {
  test('Postgres execution', async t => {
    const testData: any = {};
    t.test('Given: local stream with events', () => {
      testData.streamId = 'pointsStream1';
      testData.eventStorePG = Steps.createEventStore(EVENT_STORE_TYPE.POSTGRES);
      testData.pointsStream = Steps.createPointsStream(testData.streamId, testData.eventStorePG);
      Steps.addPointsEventsToStream(testData.pointsStream);
    })

    t.test('When: stream stored and fetched', async () => {
      try {
        await assert.doesNotReject(testData.pointsStream.store());
        testData.fetchedStream = await testData.eventStorePG.getStream("PointsStream", testData.streamId);
      } catch (error) {
        assert.fail(error as Error);
      } finally {
        await testData.eventStorePG.getStore().close();
      }
    })

    t.test('Then: fetched stream is correct', async () => {
      Steps.compareFetchedAndStoredStreams(testData.pointsStream, testData.fetchedStream);
    })
  });
})