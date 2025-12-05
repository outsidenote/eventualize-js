import { test, describe } from 'node:test'; // Use require or import
import { PointsAdded, PointsSubtracted } from "../eventstore/PointsStream/StreamEvents.js";

import Steps from './steps.js';


describe('Stream Tests', () => {
  test('Local execution', () => {
    // GIVEN
    const storageAdapterStub = Steps.createStubStorageAdapter();
    const pointsStream = Steps.createPointsStream('pointsStream1', storageAdapterStub);

    // WHEN
    Steps.addPointsEventsToStream(pointsStream);

    // THEN
    Steps.assertStreamStateIsCorrect(pointsStream);
  });

  // test('Persist and reload', async () => {
  //   const numEvents = await pointsStream.store();
  //   assert.strictEqual(numEvents, 2);
  // });
})