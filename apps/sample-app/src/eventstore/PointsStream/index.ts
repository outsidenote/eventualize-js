import IEvDbEventPayload from '@eventualize/entities-types/IEvDbEventPayload';
import IEvDbEventsSet from '@eventualize/entities-types/IEvDbEventsSet';
import IEvDbEventMetadata from '@eventualize/entities-types/IEvDbEventMetadata';
import EvDbStreamCursor from '@eventualize/entities-types/EvDbStreamCursor';
import { EvDbView } from '@eventualize/entities-types/EvDbView';
import IEvDbViewAppliesSet from '@eventualize/entities-types/IEvDbViewAppliesSet';
import EvDbStream from '@eventualize/entities-types/EvDbStream';
import EvDbViewAddress from '@eventualize/entities-types/EvDbViewAddress';
import IEvDbStorageSnapshotAdapter from '@eventualize/entities-types/IEvDbStorageSnapshotAdapter';
import { EvDbStoredSnapshotResult } from '@eventualize/entities-types/EvDbStoredSnapshotResult';
import StorageAdapterStub from '../StorageAdapterStub.js';
import EvDbStreamAddress from '@eventualize/entities-types/EvDbStreamAddress';
import { EvDbStreamType } from '@eventualize/entities-types/primitiveTypes';
import IEvDbStorageStreamAdapter from '@eventualize/entities-types/IEvDbStorageStreamAdapter';
import SumView from './SumView.js';
import CountView from './CountView.js';

export default class PointsStream {
    public static createStream(
        streamId: string,
        streamStorageAdapter: IEvDbStorageStreamAdapter,
        snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
    ): EvDbStream {
        const streamType = 'ExampleStream';
        const sumView = new SumView(streamId, snapshotStorageAdapter)
        const countView = new CountView(streamId, snapshotStorageAdapter)
        return new EvDbStream(
            streamType,
            [sumView, countView],
            streamStorageAdapter,
            streamId,
            0
        );
    }

}