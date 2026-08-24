import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";

export class <%=_eventName%> implements IEvDbEventPayload {
    readonly payloadType = '<%=_eventName%>';
    constructor(<%-_constructorParams%>) { }
}
