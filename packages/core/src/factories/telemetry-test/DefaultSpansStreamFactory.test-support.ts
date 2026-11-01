import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { Added } from "./TelemetryTestEvents.test-support.js";

const DefaultSpansStreamFactory = new StreamFactoryBuilder("Points")
  .withEvent("Added")
  .asType<Added>()
  .withView("Sum", { sum: 0 }, { Added: (s, e) => ({ sum: s.sum + e.points }) })
  .build();

export default DefaultSpansStreamFactory;
