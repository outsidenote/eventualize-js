import { PointsAdded, PointsSubtracted, PointsStreamEvents } from "./StreamEvents.js";
import { createViewFactory } from "@eventualize/entities-types/ViewFactory";

export class SumViewState {
    constructor(public sum: number = 0) { };
}

export default createViewFactory<SumViewState, PointsStreamEvents>({
    viewName: 'SumView',
    streamType: 'PointsStream',
    defaultState: new SumViewState(0),
    handlers: {
        // TypeScript ensures you have a handler for each event type!
        PointsAdded: (oldState: SumViewState, event: PointsAdded) => {
            return new SumViewState(oldState.sum + event.points);
        },
        PointsSubtracted: (oldState: SumViewState, event: PointsSubtracted) => {
            return new SumViewState(oldState.sum - event.points);
        }
    }
});

// export default class SumView extends EvDbView<SumViewState> implements IEvDbViewAppliesSet<SumViewState, PointsStreamEvents> {
//     applyPointsAdded(oldState: SumViewState, newEvent: PointsAdded) {
//         const newState = new SumViewState(oldState.sum + newEvent.points);
//         return newState;
//     };
//     applyPointsSubtracted(oldState: SumViewState, newEvent: PointsSubtracted, eventMetadata: IEvDbEventMetadata) { return new SumViewState(oldState.sum - newEvent.points) };

//     public getDefaultState(): SumViewState {
//         return new SumViewState();
//     }

//     constructor(
//         streamId: string,
//         storageAdapter: IEvDbStorageSnapshotAdapter,
//         storedAt: Date | undefined = undefined,
//         snapshot: EvDbStoredSnapshotResult<SumViewState> = EvDbStoredSnapshotResult.getEmptyState<SumViewState>(),
//         storeOffset: number = 0,
//         memoryOffset: number = 0,
//     ) {
//         const streamAddress = new EvDbStreamAddress('ExampleStream', streamId);
//         const viewAddress = new EvDbViewAddress(streamAddress, 'SumView');
//         super(viewAddress, storedAt, storeOffset, memoryOffset, storageAdapter, snapshot);
//     }
//     ;
// }