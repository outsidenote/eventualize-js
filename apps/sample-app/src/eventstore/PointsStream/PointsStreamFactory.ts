import type { PointsAdded } from "./PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { sumViewHandlers } from "./PointsViews/SumViewHandlers.js";
import { countViewHandlers } from "./PointsViews/CountViewHandlers.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent<PointsAdded>("PointsAdded")
  .withEvent<PointsSubtracted>("PointsSubtracted")
  .withEvent<PointsMultiplied>("PointsMultiplied")
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .withView("Count", { count: 0 }, countViewHandlers)
  .withMessages()
  .withPointsAdded("Points Added With Sum Notification", (event, views) => ({
    pointsAdded: (event.payload as PointsAdded).points,
    PointsSum: views.Sum.sum,
  }))
  .withPointsAdded("Points Added With Count Notification", (event, views) => ({
    pointsAdded: (event.payload as PointsAdded).points,
    PointsCount: views.Count.count,
  }))
  .withPointsMultiplied("Points Multiplied", (event) => ({
    multiplier: (event.payload as PointsMultiplied).multiplier,
  }))
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
