import type { PointsAdded } from "../PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "../PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "../PointsEvents/PointsMultiplied.js";
import type { CountViewState } from "./CountViewState.js";

export const countViewHandlers = {
  // TypeScript ensures you have a handler for each event type!
  PointsAdded: (oldState: CountViewState, _event: PointsAdded): CountViewState => {
    return { count: oldState.count + 1 };
  },
  PointsSubtracted: (oldState: CountViewState, _event: PointsSubtracted): CountViewState => {
    return { count: oldState.count + 1 };
  },
  PointsMultiplied: function (oldState: CountViewState, _event: PointsMultiplied): CountViewState {
    return { count: oldState.count + 1 };
  },
};
