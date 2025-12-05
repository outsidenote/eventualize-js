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
