import type IEvDbEventType from "./IEvDbEventType.js";
import type IEvDbEventMetadata from "./IEvDbEventMetadata.js";

type EvDbStreamEventHandler = (
  event: IEvDbEventType,
  capturedBy?: string,
) => Promise<IEvDbEventMetadata>;

type EvDbStreamEventHandlersMap<TEvents extends IEvDbEventType> = Partial<{
  [E in TEvents as `apply${E["eventType"]}`]: EvDbStreamEventHandler;
}>;

export default EvDbStreamEventHandlersMap;
