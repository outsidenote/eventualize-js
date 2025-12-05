import { test, describe } from 'node:test'; // Use require or import
import * as assert from 'node:assert';
import StorageAdapterStub from "../src/eventstore/StorageAdapterStub.js";
import PointsStream from "../src/eventstore/PointsStream/index.js";
import { PointsAdded, PointsSubtracted } from "../src/eventstore/PointsStream/StreamEvents.js";
import SumView from '../src/eventstore/PointsStream/SumView.js';

const storageAdapterStub = new StorageAdapterStub();

describe('Stream Tests', () => {
  test('Naive execution', () => {
    const pointsStream = PointsStream.createStream('pointsStream1', storageAdapterStub, storageAdapterStub);
    const pointsAddedEvent = new PointsAdded(50);
    const pointsSubtractedEvent = new PointsSubtracted(20);
    pointsStream.appendEvent(pointsAddedEvent, 'tester');
    pointsStream.appendEvent(pointsSubtractedEvent, 'tester');

    assert.strictEqual((pointsStream.getViews()[0] as SumView).getState().sum, 30);
    assert.strictEqual(pointsStream.getEvents().length, 2);
  });
});
