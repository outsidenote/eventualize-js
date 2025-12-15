import IEvDbPayload from "./IEvDbPayload.js";
import IEvDbStreamEventMetadata from "./IEvDbEventMetadata.js";

type EvDbStreamEventHandler = (event: IEvDbPayload, capturedBy?: string) => Promise<IEvDbStreamEventMetadata>

type EvDbStreamEventHandlersMap<TEvents extends IEvDbPayload> = Partial<{
    [E in TEvents as `apply${E['payloadType']}`]: EvDbStreamEventHandler;
}>;

export default EvDbStreamEventHandlersMap;