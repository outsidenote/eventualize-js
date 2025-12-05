import IEvDbEventPayload from "./IEvDbEventPayload";
import IEvDbEventMetadata from "./IEvDbEventMetadata";

type IEvDbViewAppliesSet<Tstate, TEvents extends IEvDbEventPayload> = {
    [E in TEvents as `apply${E['payloadType']}`]: (oldState: Tstate, newEvent: E, eventMetadata: IEvDbEventMetadata) => Tstate;
};

export default IEvDbViewAppliesSet;