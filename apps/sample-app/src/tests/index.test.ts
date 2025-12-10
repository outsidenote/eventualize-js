import * as assert from 'node:assert';
import { test, describe } from 'node:test'; // Use require or import
import Steps, { EVENT_STORE_TYPE } from './steps.js';


describe('Stream Tests', () => {
  test('Local execution', () => {
    // GIVEN
    const eventStoreStub = Steps.createEventStore();
    const pointsStream = Steps.createPointsStream('pointsStream1', eventStoreStub);

    // WHEN
    Steps.addPointsEventsToStream(pointsStream);

    // THEN
    Steps.assertStreamStateIsCorrect(pointsStream);
  });

  test('Postgres execution', async () => {
    // GIVEN
    const streamId = 'pointsStream1';
    const eventStorePG = Steps.createEventStore(EVENT_STORE_TYPE.POSTGRES);
    const pointsStream = Steps.createPointsStream(streamId, eventStorePG);

    // WHEN
    Steps.addPointsEventsToStream(pointsStream);
    try {
      await assert.doesNotReject(pointsStream.store());
      const fetchedStream = await eventStorePG.getStream("PointsStream", streamId);
      console.log(fetchedStream);
    } catch (error) {
      assert.fail(error as Error);
    } finally {
      await eventStorePG.getStore().close();
    }



    // THEN
    // Steps.assertStreamStateIsCorrect(pointsStream);
  });

  // test('Persist and reload', async () => {
  //   const numEvents = await pointsStream.store();
  //   assert.strictEqual(numEvents, 2);
  // });
})