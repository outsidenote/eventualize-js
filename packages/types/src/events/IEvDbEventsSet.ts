import type IEvDbEvent from "./IEvDbEventType.js";
import type IEvDbEventType from "./IEvDbEventType.js";

type EvDbStreamEventHandler = (
  event: IEvDbEventType,
  capturedBy?: string,
) => Promise<IEvDbEvent>;

type EvDbStreamEventHandlersMap<TEvents extends IEvDbEventType> = Partial<{
  [E in TEvents as `apply${E["eventType"]}`]: EvDbStreamEventHandler;
}>;

export default EvDbStreamEventHandlersMap;
