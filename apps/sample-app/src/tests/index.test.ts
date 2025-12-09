import { test, describe } from 'node:test'; // Use require or import
import { PointsAdded, PointsSubtracted } from "../eventstore/PointsStream/events.js";

import Steps from './steps.js';


describe('Stream Tests', () => {
  test('Local execution', () => {
    // GIVEN
    const storageAdapterStub = Steps.createStubEventStore();
    const pointsStream = Steps.createPointsStream('pointsStream1', storageAdapterStub);

    // WHEN
    Steps.addPointsEventsToStream(pointsStream);

    // THEN
    Steps.assertStreamStateIsCorrect(pointsStream);
  });

  test('Postgres execution', () => {
    // GIVEN
    const storageAdapterStub = Steps.createPostgresEventStore();
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