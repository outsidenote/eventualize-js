import IEvDbEventPayload from "./IEvDbEventPayload";
import IEvDbEventMetadata from "./IEvDbEventMetadata";

type IEvDbEventsSet<TEvents extends IEvDbEventPayload> = {
    [E in TEvents as `apply${E['payloadType']}`]: (event: E, capturedBy?: string) => Promise<IEvDbEventMetadata>;
};

export default IEvDbEventsSet;