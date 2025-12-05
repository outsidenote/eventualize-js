import EvDbStreamCursor from "./EvDbStreamCursor";
import IEvDbEventMetadata from "./IEvDbEventMetadata";

export default class EvDbEvent implements IEvDbEventMetadata {

    constructor(
        public readonly eventType: string,
        public readonly streamCursor: EvDbStreamCursor,
        public readonly payload: any,
        public readonly capturedAt: Date = new Date(Date.now()),
        public readonly capturedBy: string = 'N/A',
        public readonly storedAt?: Date | null,
    ) { }
}