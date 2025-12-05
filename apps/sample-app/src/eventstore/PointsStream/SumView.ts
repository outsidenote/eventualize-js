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
