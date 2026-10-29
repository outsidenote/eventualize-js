import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { PointsAdded } from "../../eventstore/PointsStream/PointsEvents/PointsAdded.js";

// Test-only factory: checks which spans a factory produces against real adapters.
const DefaultSpansPointsFactory = new StreamFactoryBuilder("TracedPointsStream")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withView("Sum", { sum: 0 }, { PointsAdded: (s, e) => ({ sum: s.sum + e.points }) })
  .build();

export default DefaultSpansPointsFactory;
