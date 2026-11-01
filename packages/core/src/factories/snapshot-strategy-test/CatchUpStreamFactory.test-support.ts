import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { PointsAdded, AccountClosed } from "./SnapshotStrategyTestEvents.test-support.js";

const CatchUpStreamFactory = new StreamFactoryBuilder("S")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withEvent("AccountClosed")
  .asType<AccountClosed>()
  .withView("V", 0, { PointsAdded: (s, e) => s + e.points }, (s) =>
    s.offsetGap(100).onEvent("PointsAdded", (_st, e) => e.points > 1_000),
  )
  .build();

export default CatchUpStreamFactory;
