import type IEvDbEvent from "../events/IEvDbEventType.js";
import type IEvDbEventType from "../events/IEvDbEventType.js";

type IEvDbViewAppliesSet<Tstate, TEvents extends IEvDbEventType> = {
  [E in TEvents as `apply${E["eventType"]}`]: (
    oldState: Tstate,
    newEvent: E,
    eventMetadata: IEvDbEvent,
  ) => Tstate;
};

export default IEvDbViewAppliesSet;
