import { test, describe } from 'node:test'; // Use require or import

import Steps, { EVENT_STORE_TYPE } from './steps.js';
import EvDbPrismaStorageAdapter from '@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter';


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
    const eventStorePG = Steps.createEventStore(EVENT_STORE_TYPE.POSTGRES);
    const pointsStream = Steps.createPointsStream('pointsStream1', eventStorePG);

    // WHEN
    Steps.addPointsEventsToStream(pointsStream);
    try {
      await pointsStream.store()
    } catch (error) {
      console.log('Stream store error:', error)
    }

    // THEN
    // Steps.assertStreamStateIsCorrect(pointsStream);
    await eventStorePG.getStore().close();
  });

  // test('Persist and reload', async () => {
  //   const numEvents = await pointsStream.store();
  //   assert.strictEqual(numEvents, 2);
  // });
})