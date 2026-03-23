import type IEvDbEventType from "../events/IEvDbEventType.js";
import type IEvDbEventMetadata from "../events/IEvDbEventMetadata.js";

type IEvDbViewAppliesSet<Tstate, TEvents extends IEvDbEventType> = {
  [E in TEvents as `apply${E["eventType"]}`]: (
    oldState: Tstate,
    newEvent: E,
    eventMetadata: IEvDbEventMetadata,
  ) => Tstate;
};

export default IEvDbViewAppliesSet;
