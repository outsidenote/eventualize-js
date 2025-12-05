import { PointsAdded, PointsSubtracted, PointsStreamEvents } from "./StreamEvents.js";
import { createViewFactory } from "@eventualize/entities-types/ViewFactory";

export class CountViewState {
    constructor(public count: number = 0) { };
}

export default createViewFactory<CountViewState, PointsStreamEvents>({
    viewName: 'CountView',
    streamType: 'PointsStream',
    defaultState: new CountViewState(0),
    handlers: {
        // TypeScript ensures you have a handler for each event type!
        PointsAdded: (oldState: CountViewState, event: PointsAdded) => {
            return new CountViewState(oldState.count + 1);
        },
        PointsSubtracted: (oldState: CountViewState, event: PointsSubtracted) => {
            return new CountViewState(oldState.count + 1);
        }
    }
});

// export default class CountView extends EvDbView<CountViewState> implements IEvDbViewAppliesSet<CountViewState, PointsStreamEvents> {
//     applyPointsAdded(oldState: CountViewState, newEvent: PointsAdded) {
//         const newState = new CountViewState(oldState.count + 1);
//         return newState;
//     };
//     applyPointsSubtracted(oldState: CountViewState, newEvent: PointsSubtracted, eventMetadata: IEvDbEventMetadata) { return new CountViewState(oldState.count + 1) };

//     public getDefaultState(): CountViewState {
//         return new CountViewState();
//     }

//     constructor(
//         streamId: string,
//         storageAdapter: IEvDbStorageSnapshotAdapter,
//         storedAt: Date | undefined = undefined,
//         snapshot: EvDbStoredSnapshotResult<CountViewState> = EvDbStoredSnapshotResult.getEmptyState<CountViewState>(),
//         storeOffset: number = 0,
//         memoryOffset: number = 0,
//     ) {
//         const streamAddress = new EvDbStreamAddress('ExampleStream', streamId);
//         const viewAddress = new EvDbViewAddress(streamAddress, 'CountView');
//         super(viewAddress, storedAt, storeOffset, memoryOffset, storageAdapter, snapshot);
//     }
//     ;
// }