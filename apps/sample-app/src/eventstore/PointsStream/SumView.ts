import { PointsAdded, PointsSubtracted, PointsStreamEvents } from "./StreamEvents.js";
import IEvDbViewAppliesSet from '@eventualize/entities-types/IEvDbViewAppliesSet';
import IEvDbEventMetadata from '@eventualize/entities-types/IEvDbEventMetadata';
import { EvDbView } from '@eventualize/entities-types/EvDbView';
import IEvDbStorageSnapshotAdapter from '@eventualize/entities-types/IEvDbStorageSnapshotAdapter';
import {EvDbStoredSnapshotResult} from '@eventualize/entities-types/EvDbStoredSnapshotResult';
import EvDbStreamAddress from '@eventualize/entities-types/EvDbStreamAddress';
import EvDbViewAddress from '@eventualize/entities-types/EvDbViewAddress';

export class SumViewState {
    constructor(public sum: number = 0) { };
    Empty() {
        return new SumViewState(0);
    }
}

export default class SumView extends EvDbView<SumViewState> implements IEvDbViewAppliesSet<SumViewState, PointsStreamEvents> {
    applyPointsAdded(oldState: SumViewState, newEvent: PointsAdded) {
        const newState = new SumViewState(oldState.sum + newEvent.points);
        return newState;
    };
    applyPointsSubtracted(oldState: SumViewState, newEvent: PointsSubtracted, eventMetadata: IEvDbEventMetadata) { return new SumViewState(oldState.sum - newEvent.points) };

    public getDefaultState(): SumViewState {
        return new SumViewState();
    }

    constructor(
        streamId: string,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        storedAt: Date | undefined = undefined,
        snapshot: EvDbStoredSnapshotResult<SumViewState> = EvDbStoredSnapshotResult.getEmptyState<SumViewState>(),
        storeOffset: number = 0,
        memoryOffset: number = 0,
    ) {
        const streamAddress = new EvDbStreamAddress('ExampleStream', streamId);
        const viewAddress = new EvDbViewAddress(streamAddress, 'SumView');
        super(viewAddress, storedAt, storeOffset, memoryOffset, storageAdapter, snapshot);
    }
    ;
}