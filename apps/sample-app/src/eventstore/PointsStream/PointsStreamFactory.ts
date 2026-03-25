import type { PointsAdded } from "./PointsEvents/PointsAdded.js";
import type { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
import type { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import { sumViewHandlers } from "./PointsViews/SumViewHandlers.js";
import { countViewHandlers } from "./PointsViews/CountViewHandlers.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded").asType<PointsAdded>()
  .withEvent("PointsSubtracted").asType<PointsSubtracted>()
  .withEvent("PointsMultiplied").asType<PointsMultiplied>()
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .withView("Count", { count: 0 }, countViewHandlers)
  .withMessages("PointsAdded", (payload, views, metadata) => [
    EvDbMessage.createFromMetadata(metadata, {
      messageType: "Points Added With Sum Notification",
      pointsAdded: payload.points,
      PointsSum: views.Sum.sum,
    }),
    EvDbMessage.createFromMetadata(metadata, {
      messageType: "Points Added With Count Notification",
      pointsAdded: payload.points,
      PointsCount: views.Count.count,
    }),
  ])
  .withMessages("PointsMultiplied", (payload, _views, metadata) => [
    EvDbMessage.createFromMetadata(metadata, {
      messageType: "Points Multiplied",
      multiplier: payload.multiplier,
    }),
  ])
  .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;
