import EvDbStreamCursor from "./EvDbStreamCursor";
import IEvDbEventMetadata from "./IEvDbEventMetadata";
import IEvDbEventPayload from "./IEvDbEventPayload";

export default class EvDbEvent implements IEvDbEventMetadata {

    constructor(
        public readonly eventType: string,
        public readonly streamCursor: EvDbStreamCursor,
        public readonly payload: IEvDbEventPayload,
        public readonly capturedAt: Date = new Date(Date.now()),
        public readonly capturedBy: string = 'N/A',
        public readonly storedAt?: Date | null,
    ) { }
}