import type { PointsAdded, PointsSubtracted, PointsMultiplied } from "./events.js";

export class CountViewState {
  constructor(public count: number = 0) {}
}

export const countViewHandlers = {
  // TypeScript ensures you have a handler for each event type!
  PointsAdded: (oldState: CountViewState, _event: PointsAdded) => {
    return new CountViewState(oldState.count + 1);
  },
  PointsSubtracted: (oldState: CountViewState, _event: PointsSubtracted) => {
    return new CountViewState(oldState.count + 1);
  },
  PointsMultiplied: function (oldState: CountViewState): CountViewState {
    return new CountViewState(oldState.count + 1);
  },
};

export class SumViewState {
  constructor(public sum: number = 0) {}
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
  },
};
