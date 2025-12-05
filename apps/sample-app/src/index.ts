import StorageAdapterStub from "./eventstore/StorageAdapterStub.js";
import PointsStream from "./eventstore/PointsStream/index.js";
import { PointsAdded, PointsSubtracted } from "./eventstore/PointsStream/StreamEvents.js";

const storageAdapterStub = new StorageAdapterStub();

const pointsStream = PointsStream.createStream('pointsStream1', storageAdapterStub, storageAdapterStub);

const pointsAddedEvent = new PointsAdded(50);
const pointsSubtractedEvent = new PointsSubtracted(20);
pointsStream.appendEvent(pointsAddedEvent, 'tester');
pointsStream.appendEvent(pointsSubtractedEvent, 'tester');

console.log('Points Stream Pending Events:\n=========\n', pointsStream.getEvents());
console.log('Points Stream Views Current State:\n=========\n',pointsStream.getViews());