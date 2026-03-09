import type { PointsAdded } from "./PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { sumViewHandler } from "./PointsViews/SumViewHandlers.js";
import { countViewHandler } from "./PointsViews/CountViewHandlers.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent<PointsAdded>("PointsAdded")
  .withEvent<PointsSubtracted>("PointsSubtracted")
  .withEvent<PointsMultiplied>("PointsMultiplied")
  .withViews()
  .addView("Sum", { sum: 0 }, sumViewHandler)
  .addView("Count", { count: 0 }, countViewHandler)
  .withMessages()
  .addPointsAdded("Points Added With Sum Notification", (payload, views) => ({
    pointsAdded: payload.points,
    PointsSum: views.Sum.sum,
  }))
  .addPointsAdded("Points Added With Count Notification", (payload, views) => ({
    pointsAdded: payload.points,
    PointsCount: views.Count.count,
  }))
  .addPointsMultiplied("Points Multiplied", (payload) => ({
    multiplier: payload.multiplier,
  }))
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
