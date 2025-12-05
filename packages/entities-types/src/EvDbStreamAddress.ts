import EvDbStreamCursor from "./EvDbStreamCursor.js";

export default class EvDbStreamAddress {
    constructor(public readonly streamType: string, public readonly streamId: string) { }

    equals(other: EvDbStreamCursor): boolean {
        return this.streamType === other.streamType &&
            this.streamId === other.streamId;
    }
}