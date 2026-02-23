import type { PointsAdded } from "../PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "../PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "../PointsEvents/PointsMultiplied.js";
import { SumViewState } from "./SumViewState.js";

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
