import type IEvDbEvent from "../events/EvDbEvent.js";
import type EvDbMessage from "./EvDbMessage.js";

type EVDbMessagesProducer = (
  event: IEvDbEvent,
  viewStates: Readonly<Record<string, unknown>>,
) => EvDbMessage[];
export default EVDbMessagesProducer;
