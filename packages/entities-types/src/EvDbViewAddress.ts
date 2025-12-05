import EvDbStreamAddress from "./EvDbStreamAddress";

export default class EvDbViewAddress {
    public readonly streamType: string;
    public readonly streamId: string;
    public readonly viewName: string;
    constructor(streamAddress: EvDbStreamAddress, viewName: string) {
        this.streamType = streamAddress.streamType;
        this.streamId = streamAddress.streamId;
        this.viewName = viewName;
    }
}