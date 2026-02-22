import type EvDbEvent from "./EvDbEvent.js";
import type EvDbMessage from "./EvDbMessage.js";

type EVDbMessagesProducer = (
  event: EvDbEvent,
  viewStates: Readonly<Record<string, unknown>>,
) => EvDbMessage[];
export default EVDbMessagesProducer;
