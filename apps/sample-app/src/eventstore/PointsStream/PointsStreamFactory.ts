import { PointsAdded } from "./PointsEvents/PointsAdded.js";
import { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
import { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { SumViewState } from "./PointsViews/SumViewState.js";
import { CountViewState } from "./PointsViews/CountViewState.js";
import { sumViewHandlers } from "./PointsViews/SumViewHandlers.js";
import { countViewHandlers } from "./PointsViews/CountViewHandlers.js";
import { poinstAddedMessages } from "./PointsMessages/PoinstAddedMessages.js";
import { pointsMultipliedMessages } from "./PointsMessages/PointsMultipliedMessages.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEventType(PointsAdded, poinstAddedMessages)
  .withEventType(PointsSubtracted)
  .withEventType(PointsMultiplied, pointsMultipliedMessages)
  .withView("Sum", SumViewState, sumViewHandlers)
  .withView("Count", CountViewState, countViewHandlers)
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
