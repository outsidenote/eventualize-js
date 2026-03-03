import type IEvDbEvent from "../events/IEvDbEvent.js";

type IEvDbViewAppliesSet<Tstate, TEvents extends { readonly eventType: string }> = {
  [E in TEvents as `apply${E["eventType"]}`]: (
    oldState: Tstate,
    newEvent: E,
    eventMetadata: IEvDbEvent,
  ) => Tstate;
};

export default IEvDbViewAppliesSet;
