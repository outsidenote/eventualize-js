import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { PointsAdded } from "./SnapshotStrategyTestEvents.test-support.js";

const FirstOffsetStreamFactory = new StreamFactoryBuilder("S")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withView("V", 0, { PointsAdded: (s, e) => s + e.points }, (s) =>
    s.onEvent((_s, _e, m) => m.streamCursor.offset === 1),
  )
  .build();

export default FirstOffsetStreamFactory;
