import type IEvDbEvent from "./IEvDbEvent.js";

type EvDbStreamEventHandler = (
  event: { readonly eventType: string },
  capturedBy?: string,
) => Promise<IEvDbEvent>;

type EvDbStreamEventHandlersMap<TEvents extends { readonly eventType: string }> = Partial<{
  [E in TEvents as `apply${E["eventType"]}`]: EvDbStreamEventHandler;
}>;

export default EvDbStreamEventHandlersMap;
