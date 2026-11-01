import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { PointsAdded } from "./SnapshotStrategyTestEvents.test-support.js";

const ThrowingPredicateStreamFactory = new StreamFactoryBuilder("S")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withView("V", 0, { PointsAdded: (s, e) => s + e.points }, (s) =>
    s.onEvent("PointsAdded", () => {
      throw new Error("predicate must not run");
    }),
  )
  .build();

export default ThrowingPredicateStreamFactory;
