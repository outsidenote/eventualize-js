import { PointsAdded, PointsSubtracted, PointsStreamEvents } from "./StreamEvents.js";
import IEvDbViewAppliesSet from '@eventualize/entities-types/IEvDbViewAppliesSet';
import IEvDbEventMetadata from '@eventualize/entities-types/IEvDbEventMetadata';
import { EvDbView } from '@eventualize/entities-types/EvDbView';
import IEvDbStorageSnapshotAdapter from '@eventualize/entities-types/IEvDbStorageSnapshotAdapter';
import { EvDbStoredSnapshotResult } from '@eventualize/entities-types/EvDbStoredSnapshotResult';
import EvDbStreamAddress from '@eventualize/entities-types/EvDbStreamAddress';
import EvDbViewAddress from '@eventualize/entities-types/EvDbViewAddress';

export class CountViewState {
    constructor(public count: number = 0) { };
    Empty() {
        return new CountViewState(0);
    }
}

export default class CountView extends EvDbView<CountViewState> implements IEvDbViewAppliesSet<CountViewState, PointsStreamEvents> {
    applyPointsAdded(oldState: CountViewState, newEvent: PointsAdded) {
        const newState = new CountViewState(oldState.count + 1);
        return newState;
    };
    applyPointsSubtracted(oldState: CountViewState, newEvent: PointsSubtracted, eventMetadata: IEvDbEventMetadata) { return new CountViewState(oldState.count + 1) };

    public getDefaultState(): CountViewState {
        return new CountViewState();
    }

    constructor(
        streamId: string,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        storedAt: Date | undefined = undefined,
        snapshot: EvDbStoredSnapshotResult<CountViewState> = EvDbStoredSnapshotResult.getEmptyState<CountViewState>(),
        storeOffset: number = 0,
        memoryOffset: number = 0,
    ) {
        const streamAddress = new EvDbStreamAddress('ExampleStream', streamId);
        const viewAddress = new EvDbViewAddress(streamAddress, 'CountView');
        super(viewAddress, storedAt, storeOffset, memoryOffset, storageAdapter, snapshot);
    }
    ;
}