import { PointsAdded } from "./PointsEvents/PointsAdded.js";
import { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
import { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { sumViewHandlers } from "./PointsViews/SumViewHandlers.js";
import { countViewHandlers } from "./PointsViews/CountViewHandlers.js";
import { pointsAddedMessages } from "./PointsMessages/PoinstAddedMessages.js";
import { pointsMultipliedMessages } from "./PointsMessages/PointsMultipliedMessages.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEventType(PointsAdded, pointsAddedMessages)
  .withEventType(PointsSubtracted)
  .withEventType(PointsMultiplied, pointsMultipliedMessages)
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .withView("Count", { count: 0 }, countViewHandlers)
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
