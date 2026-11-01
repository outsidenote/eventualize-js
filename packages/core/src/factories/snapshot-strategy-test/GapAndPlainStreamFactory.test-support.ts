import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { PointsAdded } from "./SnapshotStrategyTestEvents.test-support.js";

const GapAndPlainStreamFactory = new StreamFactoryBuilder("S")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withView("Gapped", 0, { PointsAdded: (s, e) => s + e.points }, (s) => s.offsetGap(2))
  .withView("Plain", 0, { PointsAdded: (s, e) => s + e.points })
  .build();

export default GapAndPlainStreamFactory;
