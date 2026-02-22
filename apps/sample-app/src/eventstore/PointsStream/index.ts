import { PointsAdded, PointsMultiplied, PointsSubtracted } from "./events.js";
import { StreamFactoryBuilder } from "@eventualize/core/EvDbStreamFactory";
import { CountViewState, SumViewState, sumViewHandlers, countViewHandlers } from "./views.js";
import { poinstAddedMessages, pointsMultipliedMessages } from "./messages.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEventType(PointsAdded, poinstAddedMessages)
  .withEventType(PointsSubtracted)
  .withEventType(PointsMultiplied, pointsMultipliedMessages)
  .withView("Sum", SumViewState, sumViewHandlers)
  .withView("Count", CountViewState, countViewHandlers)
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
