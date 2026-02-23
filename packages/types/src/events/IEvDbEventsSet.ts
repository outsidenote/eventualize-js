import type IEvDbEventPayload from "./IEvDbEventPayload.js";
import type IEvDbEventMetadata from "./IEvDbEventMetadata.js";

type EvDbStreamEventHandler = (
  event: IEvDbEventPayload,
  capturedBy?: string,
) => Promise<IEvDbEventMetadata>;

type EvDbStreamEventHandlersMap<TEvents extends IEvDbEventPayload> = Partial<{
  [E in TEvents as `apply${E["payloadType"]}`]: EvDbStreamEventHandler;
}>;

export default EvDbStreamEventHandlersMap;
