import { test, describe } from 'node:test'; // Use require or import

import Steps from './steps.js';


describe('Stream Tests', () => {
  test('Local execution', () => {
    // GIVEN
    const eventStoreStub = Steps.createStubEventStore();
    const pointsStream = Steps.createPointsStream('pointsStream1', eventStoreStub);

    // WHEN
    Steps.addPointsEventsToStream(pointsStream);

    // THEN
    Steps.assertStreamStateIsCorrect(pointsStream);
  });

  test('Postgres execution', async () => {
    // GIVEN
    const eventStorePG = Steps.createPostgresEventStore();
    const pointsStream = Steps.createPointsStream('pointsStream1', eventStorePG);

    // WHEN
    Steps.addPointsEventsToStream(pointsStream);
    await pointsStream.store()

    // THEN
    Steps.assertStreamStateIsCorrect(pointsStream);
  });

  // test('Persist and reload', async () => {
  //   const numEvents = await pointsStream.store();
  //   assert.strictEqual(numEvents, 2);
  // });
})