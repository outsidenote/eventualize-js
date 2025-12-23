import IEvDbEventMetadata from "@eventualize/types/IEvDbEventMetadata";
import { PointsAdded, PointsSubtracted, PointsStreamEvents, PointsMultiplied } from "./events.js";
import { createViewFactory } from "@eventualize/core/EvDbViewFactory";

export class CountViewState {
    constructor(public count: number = 0) { };
}

export const countViewHandlers = {
    // TypeScript ensures you have a handler for each event type!
    PointsAdded: (oldState: CountViewState, event: PointsAdded) => {
        return new CountViewState(oldState.count + 1);
    },
    PointsSubtracted: (oldState: CountViewState, event: PointsSubtracted) => {
        return new CountViewState(oldState.count + 1);
    },
    PointsMultiplied: function (oldState: CountViewState): CountViewState {
        return new CountViewState(oldState.count + 1);
    }
}

export class SumViewState {
    constructor(public sum: number = 0) { };
}

export const sumViewHandlers = {
    // TypeScript ensures you have a handler for each event type!
    PointsAdded: (oldState: SumViewState, event: PointsAdded) => {
        return new SumViewState(oldState.sum + event.points);
    },
    PointsSubtracted: (oldState: SumViewState, event: PointsSubtracted) => {
        return new SumViewState(oldState.sum - event.points);
    },
    PointsMultiplied: function (oldState: SumViewState, event: PointsMultiplied): SumViewState {
        return new SumViewState(oldState.sum * event.multiplier);
    }
};
