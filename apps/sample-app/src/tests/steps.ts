import * as assert from 'node:assert';
import StorageAdapterStub from "./StorageAdapterStub.js";
import PointsStreamFactory from "../eventstore/PointsStream/index.js";
import IEvDbStorageSnapshotAdapter from "@eventualize/entities-types/IEvDbStorageSnapshotAdapter";
import IEvDbStorageStreamAdapter from "@eventualize/entities-types/IEvDbStorageStreamAdapter";
import { PointsAdded, PointsSubtracted } from "../eventstore/PointsStream/StreamEvents.js";
import EvDbStream from "@eventualize/entities-types/EvDbStream";
import { EvDbView } from '@eventualize/entities-types/EvDbView';
import { SumViewState } from '../eventstore/PointsStream/SumView.js';
import { CountViewState } from '../eventstore/PointsStream/CountView.js';

export default class Steps {
    public static createStubStorageAdapter() {
        return new StorageAdapterStub();

    }
    public static createPointsStream(streamId: string, storageAdapter: IEvDbStorageSnapshotAdapter & IEvDbStorageStreamAdapter) {
        return PointsStreamFactory.create(streamId, storageAdapter, storageAdapter);
    }
    public static addPointsEventsToStream(stream: EvDbStream) {
        stream.appendEvent(new PointsAdded(50));
        stream.appendEvent(new PointsSubtracted(20));
    }
    public static assertStreamStateIsCorrect(stream: EvDbStream) {
        const sumView = stream.getView('SumView');
        if (!sumView)
            assert.fail('SumView not found in stream');
        const countView = stream.getView('CountView');
        if (!countView)
            assert.fail('CountView not found in stream');
        assert.strictEqual((stream.getView('SumView') as EvDbView<SumViewState>).getState().sum, 30);
        assert.strictEqual((stream.getView('CountView') as EvDbView<CountViewState>).getState().count, 2);
        assert.strictEqual(stream.getEvents().length, 2);
    }
}