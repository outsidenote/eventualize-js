import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { Started, Ticked, Ended, RareState, CountState } from "./PointerRowsEvents.js";

// Test-only factory: `Rare` handles only Started/Ended, so Ticked events write pointer rows.
// `Count` handles every event and has no strategy, so it writes a full row on every store.
const PointerRowsStreamFactory = new StreamFactoryBuilder("PointerRowsStream")
  .withEvent("Started")
  .asType<Started>()
  .withEvent("Ticked")
  .asType<Ticked>()
  .withEvent("Ended")
  .asType<Ended>()
  .withView<"Rare", RareState>(
    "Rare",
    { started: false, ended: false },
    {
      Started: (s) => ({ ...s, started: true }),
      Ended: (s) => ({ ...s, ended: true }),
    },
    (snapshot) => snapshot.onEvent("Started").onEvent("Ended"),
  )
  .withView<"Count", CountState>(
    "Count",
    { count: 0 },
    {
      Started: (s) => ({ count: s.count + 1 }),
      Ticked: (s) => ({ count: s.count + 1 }),
      Ended: (s) => ({ count: s.count + 1 }),
    },
  )
  .build();

export default PointerRowsStreamFactory;
export type PointerRowsStreamType = typeof PointerRowsStreamFactory.StreamType;
