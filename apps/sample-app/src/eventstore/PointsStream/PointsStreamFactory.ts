import type { PointsAdded } from "./PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
import { StreamFactoryBuilder, evt } from "@eventualize/core/factories/StreamFactoryBuilder";
import { sumViewHandlers } from "./PointsViews/SumViewHandlers.js";
import { countViewHandlers } from "./PointsViews/CountViewHandlers.js";
import { pointsAddedMessages } from "./PointsMessages/PoinstAddedMessages.js";
import { pointsMultipliedMessages } from "./PointsMessages/PointsMultipliedMessages.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEventType(evt<PointsAdded, "PointsAdded">("PointsAdded"), pointsAddedMessages)
  .withEventType(evt<PointsSubtracted, "PointsSubtracted">("PointsSubtracted"))
  .withEventType(
    evt<PointsMultiplied, "PointsMultiplied">("PointsMultiplied"),
    pointsMultipliedMessages,
  )
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .withView("Count", { count: 0 }, countViewHandlers)
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
