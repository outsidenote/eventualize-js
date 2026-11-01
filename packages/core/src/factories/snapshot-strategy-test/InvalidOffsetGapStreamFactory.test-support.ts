import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { PointsAdded } from "./SnapshotStrategyTestEvents.test-support.js";

// Throws RangeError while this module loads.
const InvalidOffsetGapStreamFactory = new StreamFactoryBuilder("S")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withView("V", 0, {}, (s) => s.offsetGap(-1))
  .build();

export default InvalidOffsetGapStreamFactory;
