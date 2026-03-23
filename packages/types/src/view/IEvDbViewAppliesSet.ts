import type IEvDbEventPayload from "../events/IEvDbEventPayload.js";
import type IEvDbEventMetadata from "../events/IEvDbEventMetadata.js";

type IEvDbViewAppliesSet<Tstate, TEvents extends IEvDbEventPayload> = {
  [E in TEvents as `apply${E["eventType"]}`]: (
    oldState: Tstate,
    newEvent: E,
    eventMetadata: IEvDbEventMetadata,
  ) => Tstate;
};

export default IEvDbViewAppliesSet;
