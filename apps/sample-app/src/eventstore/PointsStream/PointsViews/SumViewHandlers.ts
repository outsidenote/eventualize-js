import type { PointsAdded } from "../PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "../PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "../PointsEvents/PointsMultiplied.js";
import type { SumViewState } from "./SumViewState.js";

export const sumViewHandlers = {
  // TypeScript ensures you have a handler for each event type!
  PointsAdded: (oldState: SumViewState, event: PointsAdded): SumViewState => {
    return { sum: oldState.sum + event.points };
  },
  PointsSubtracted: (oldState: SumViewState, event: PointsSubtracted): SumViewState => {
    return { sum: oldState.sum - event.points };
  },
  PointsMultiplied: function (oldState: SumViewState, event: PointsMultiplied): SumViewState {
    return { sum: oldState.sum * event.multiplier };
  },
};
