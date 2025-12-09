import * as assert from 'node:assert';
import StorageAdapterStub from "./StorageAdapterStub.js";
import PointsStreamFactory from "../eventstore/PointsStream/index.js";
import { PointsAdded, PointsSubtracted } from "../eventstore/PointsStream/events.js";
import EvDbStream from "@eventualize/types/EvDbStream";
import { EvDbView } from '@eventualize/entities-types/EvDbView';
import { SumViewState, CountViewState } from '../eventstore/PointsStream/views.js';
import { EvDbEventStoreBuilder, StreamMap, EvDbEventStoreType } from '@eventualize/entities-types/EvDbEventStore';

export default class Steps {
    public static createStubEventStore() {
        const storageAdapter = new StorageAdapterStub();

        const eventstore = new EvDbEventStoreBuilder()
            .withAdapter(storageAdapter)
            .withStreamFactory(PointsStreamFactory)
            .build();

        return eventstore;

    }
    public static createPointsStream<TStreams extends StreamMap>(streamId: string, eventStore: EvDbEventStoreType<TStreams>): EvDbStream {
        return eventStore.createPointsStream(streamId);
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