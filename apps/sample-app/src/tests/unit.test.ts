// import * as assert from 'node:assert';
// import { test, describe } from 'node:test'; // Use require or import
// import Steps, { EVENT_STORE_TYPE } from './steps.js';


// describe('Unit Tests', () => {
//   test('Add events to empty stream', t => {
//     const testData: any = {};
//     t.test('Given: empty stream', () => {
//       testData.client = Steps.createStoreClient(EVENT_STORE_TYPE.STUB);
//       testData.eventStoreStub = Steps.createEventStore(testData.client, EVENT_STORE_TYPE.STUB);
//       testData.pointsStream = Steps.createPointsStream('pointsStream1', testData.eventStoreStub);
//     });

//     t.test('When: new events added to stream', () => {
//       Steps.addPointsEventsToStream(testData.pointsStream);
//     });

//     t.test('Then: stream applies events correctly', () => {
//       Steps.assertStreamStateIsCorrect(testData.pointsStream);
//     })
//   });
// })