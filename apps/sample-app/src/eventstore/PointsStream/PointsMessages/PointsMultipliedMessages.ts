import type IEvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { PointsMultiplied } from "../PointsEvents/PointsMultiplied.js";

export const pointsMultipliedMessages = (
  event: IEvDbEvent,
  _viewStates: Readonly<Record<string, unknown>>,
) => [
  EvDbMessage.createFromEvent(event, {
    eventType: "Points Multiplied",
    multiplier: (event.payload as PointsMultiplied).multiplier,
  }),
];
