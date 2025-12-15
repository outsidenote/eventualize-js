import { EvDbStreamEventRaw } from "./EvDbEvent.js";
import EvDbMessage from "./EvDbMessage.js";

type EVDbMessagesProducer = (event: EvDbStreamEventRaw, viewStates: Readonly<Record<string, unknown>>) => EvDbMessage[];
export default EVDbMessagesProducer;