import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import type { Added } from "./TelemetryTestEvents.test-support.js";

const VerboseSpansStreamFactory = new StreamFactoryBuilder("Points")
  .withEvent("Added")
  .asType<Added>()
  .withView("Sum", { sum: 0 }, { Added: (s, e) => ({ sum: s.sum + e.points }) })
  .withTelemetry({
    spans: { "eventualize.stream.append": true, "eventualize.adapter.*": true },
  })
  .build();

export default VerboseSpansStreamFactory;
