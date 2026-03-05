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
  .withMessageFactory<PointsAdded>(
    "Points Added With Sum Notification",
    "PointsAdded",
    (event, views) => ({
      pointsAdded: event.payload.points,
      PointsSum: views.Sum.sum,
    }),
  )
  .withMessageFactory<PointsAdded>(
    "Points Added With Count Notification",
    "PointsAdded",
    (event, views) => ({
      pointsAdded: event.payload.points,
      PointsCount: views.Count.count,
    }),
  )
  .withMessageFactory<PointsMultiplied>("Points Multiplied", "PointsMultiplied", (event) => ({
    multiplier: event.payload.multiplier,
  }))
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
