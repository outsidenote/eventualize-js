import { test, describe } from 'node:test'; // Use require or import
import * as assert from 'node:assert';
import StorageAdapterStub from "../src/eventstore/StorageAdapterStub.js";
import PointsStream from "../src/eventstore/PointsStream/index.js";
import { PointsAdded, PointsSubtracted } from "../src/eventstore/PointsStream/StreamEvents.js";
import SumView from '../src/eventstore/PointsStream/SumView.js';
import CountView from '../src/eventstore/PointsStream/CountView.js';

const storageAdapterStub = new StorageAdapterStub();

describe('Stream Tests', () => {
  test('Naive execution', () => {
    const pointsStream = PointsStream.createStream('pointsStream1', storageAdapterStub, storageAdapterStub);
    const pointsAddedEvent = new PointsAdded(50);
    const pointsSubtractedEvent = new PointsSubtracted(20);
    pointsStream.appendEvent(pointsAddedEvent, 'tester');
    pointsStream.appendEvent(pointsSubtractedEvent, 'tester');

    assert.strictEqual((pointsStream.getView('SumView') as SumView).getState().sum, 30);
    assert.strictEqual((pointsStream.getView('CountView') as CountView).getState().count, 2);
    assert.strictEqual(pointsStream.getEvents().length, 2);
  });
});
