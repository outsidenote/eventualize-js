import * as assert from 'node:assert';
import StorageAdapterStub from "../src/eventstore/StorageAdapterStub.js";
import PointsStream from "../src/eventstore/PointsStream/index.js";
import IEvDbStorageSnapshotAdapter from "@eventualize/entities-types/IEvDbStorageSnapshotAdapter";
import IEvDbStorageStreamAdapter from "@eventualize/entities-types/IEvDbStorageStreamAdapter";
import { PointsAdded, PointsSubtracted } from "../src/eventstore/PointsStream/StreamEvents.js";
import EvDbStream from "@eventualize/entities-types/EvDbStream";
import SumView from '../src/eventstore/PointsStream/SumView.js';
import CountView from '../src/eventstore/PointsStream/CountView.js';

export default class Steps {
    public static createStubStorageAdapter() {
        return new StorageAdapterStub();

    }
    public static createPointsStream(streamId: string, storageAdapter: IEvDbStorageSnapshotAdapter & IEvDbStorageStreamAdapter) {
        return PointsStream.createStream(streamId, storageAdapter, storageAdapter);
    }
    public static addPointsEventsToStream(stream: EvDbStream) {
        stream.appendEvent(new PointsAdded(50));
        stream.appendEvent(new PointsSubtracted(20));
    }
    public static assertStreamStateIsCorrect(stream: EvDbStream) {
        assert.strictEqual((stream.getView('SumView') as SumView).getState().sum, 30);
            assert.strictEqual((stream.getView('CountView') as CountView).getState().count, 2);
            assert.strictEqual(stream.getEvents().length, 2);
    }
}