import type { PointsAdded } from "../PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "../PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "../PointsEvents/PointsMultiplied.js";
import type { SumViewState } from "./SumViewState.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

export function sumViewHandler(
  oldState: SumViewState,
  payload: unknown,
  meta: IEvDbEventMetadata,
): SumViewState {
  if (meta.eventType === "PointsAdded") {
    return { sum: oldState.sum + (payload as PointsAdded).points };
  }
  if (meta.eventType === "PointsSubtracted") {
    return { sum: oldState.sum - (payload as PointsSubtracted).points };
  }
  if (meta.eventType === "PointsMultiplied") {
    return { sum: oldState.sum * (payload as PointsMultiplied).multiplier };
  }
  return oldState;
}
