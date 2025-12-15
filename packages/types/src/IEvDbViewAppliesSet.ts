import IEvDbPayload from "./IEvDbPayload.js";
import IEvDbStreamEventMetadata from "./IEvDbEventMetadata.js";

type IEvDbViewAppliesSet<Tstate, TEvents extends IEvDbPayload> = {
    [E in TEvents as `apply${E['payloadType']}`]: (oldState: Tstate, newEvent: E, eventMetadata: IEvDbStreamEventMetadata) => Tstate;
};

export default IEvDbViewAppliesSet;