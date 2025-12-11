import EvDbEvent from "./EvDbEvent.js";
import EvDbMessage from "./EvDbMessage.js";

type EVDbMessagesProducer = (event: EvDbEvent, viewStates: Readonly<Record<string, unknown>>) => EvDbMessage[];
export default EVDbMessagesProducer;