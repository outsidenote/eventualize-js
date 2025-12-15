import EvDbStreamCursor from "./EvDbStreamCursor.js";
import IEvDbStreamEventMetadata, { IEvDbEventMetadata } from "./IEvDbEventMetadata.js";
import IEvDbPayload from "./IEvDbPayload.js";


export class EvDbEventRaw implements IEvDbEventMetadata {
    constructor(
        public readonly eventType: string,
        public readonly payload: IEvDbPayload,
        public readonly capturedAt: Date = new Date(Date.now()),
        public readonly capturedBy: string = 'N/A',
    ) { }
}
export class EvDbEvent<TPayload extends IEvDbPayload> extends EvDbEventRaw {

    constructor(
        eventType: string,
        payload: TPayload,
        capturedAt?: Date,
        capturedBy?: string,
    ) {
        super(eventType, payload, capturedAt, capturedBy);
    }
}



export class EvDbStreamEventRaw extends EvDbEventRaw {

    constructor(
        eventType: string,
        public readonly streamCursor: EvDbStreamCursor,
        payload: IEvDbPayload,
        capturedAt: Date = new Date(Date.now()),
        capturedBy: string = 'N/A',
        public readonly storedAt?: Date,
    ) {
        super(eventType, payload, capturedAt, capturedBy);
    }

}
export default class EvDbStreamEvent<TPayload extends IEvDbPayload> extends EvDbStreamEventRaw {

    constructor(
        eventType: string,
        streamCursor: EvDbStreamCursor,
        payload: TPayload,
        capturedAt: Date = new Date(Date.now()),
        capturedBy: string = 'N/A',
        public readonly storedAt?: Date,
    ) {
        super(eventType, streamCursor, payload, capturedAt, capturedBy);
    }

    public static fromEvent<TPayload extends IEvDbPayload>(event: EvDbEvent<TPayload>, streamCursor: EvDbStreamCursor): EvDbStreamEvent<TPayload> {
        return new EvDbStreamEvent(
            event.eventType,
            streamCursor,
            event.payload,
            event.capturedAt,
            event.capturedBy
        )
    }
}