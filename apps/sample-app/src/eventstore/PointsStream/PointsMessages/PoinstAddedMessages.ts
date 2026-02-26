import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { PointsAdded } from "../PointsEvents/PointsAdded.js";
import type { SumViewState } from "../PointsViews/SumViewState.js";
import type { CountViewState } from "../PointsViews/CountViewState.js";

export const pointsAddedMessages = (
  event: EvDbEvent,
  viewStates: Readonly<Record<string, unknown>>,
) => [
  EvDbMessage.createFromEvent(event, {
    payloadType: "Points Added With Sum Notification",
    pointsAdded: (event.payload as PointsAdded).points,
    PointsSum: (viewStates["Sum"] as SumViewState).sum,
  }),
  EvDbMessage.createFromEvent(event, {
    payloadType: "Points Added With Count Notification",
    pointsAdded: (event.payload as PointsAdded).points,
    PointsCount: (viewStates["Count"] as CountViewState).count,
  }),
];
