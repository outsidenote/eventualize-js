import IEvDbEventPayload from "./IEvDbEventPayload.js";
import IEvDbEventMetadata from "./IEvDbEventMetadata.js";

type IEvDbEventsSet<TEvents extends IEvDbEventPayload> = {
    [E in TEvents as `apply${E['payloadType']}`]: (event: E, capturedBy?: string) => Promise<IEvDbEventMetadata>;
};

export default IEvDbEventsSet;