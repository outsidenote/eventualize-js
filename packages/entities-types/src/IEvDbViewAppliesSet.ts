import IEvDbEventPayload from "./IEvDbEventPayload.js";
import IEvDbEventMetadata from "./IEvDbEventMetadata.js";

type IEvDbViewAppliesSet<Tstate, TEvents extends IEvDbEventPayload> = {
    [E in TEvents as `apply${E['payloadType']}`]: (oldState: Tstate, newEvent: E, eventMetadata: IEvDbEventMetadata) => Tstate;
};

export default IEvDbViewAppliesSet;