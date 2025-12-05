import EvDbStream from '@eventualize/entities-types/EvDbStream';
import IEvDbStorageSnapshotAdapter from '@eventualize/entities-types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/entities-types/IEvDbStorageStreamAdapter';
import sumViewFactory from './SumView.js';
import countViewFactory from './CountView.js';

export default class PointsStream {
    public static createStream(
        streamId: string,
        streamStorageAdapter: IEvDbStorageStreamAdapter,
        snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
    ): EvDbStream {
        const streamType = 'PointsStream';
        const sumView = sumViewFactory.create(streamId, snapshotStorageAdapter);
        const countView = countViewFactory.create(streamId, snapshotStorageAdapter)
        return new EvDbStream(
            streamType,
            [sumView, countView],
            streamStorageAdapter,
            streamId,
            0
        );
    }

}