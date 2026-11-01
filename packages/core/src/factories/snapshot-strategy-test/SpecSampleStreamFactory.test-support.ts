import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { PointsAdded, AccountClosed } from "./SnapshotStrategyTestEvents.test-support.js";

const SpecSampleStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withEvent("AccountClosed")
  .asType<AccountClosed>()
  .withView(
    "Balance",
    0,
    {
      PointsAdded: (s, e) => s + e.points,
    },
    (snapshot) =>
      snapshot
        .when(({ offsetGap, durationGapMs }) => offsetGap >= 50 || durationGapMs >= 5 * 60_000)
        .onEvent("AccountClosed")
        .onEvent("PointsAdded", (_state, e) => e.points > 1_000),
  )
  .withView("Audit", [] as string[], {})
  .withView("Risk", [] as string[], {}, (snapshot) =>
    snapshot
      .offsetGap(50)
      .durationGapMs(5 * 60_000)
      .onEvent((_s, _e, m) => m.streamCursor.offset === 1),
  )
  .build();

export default SpecSampleStreamFactory;
