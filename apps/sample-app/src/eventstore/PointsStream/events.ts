import { EvDbEvent as IEvDbEvent } from "@eventualize/types/EvDbEvent";
import IEvDbPayload from "@eventualize/types/IEvDbPayload";

export class PointsAddedPayload implements IEvDbPayload {
    constructor(public readonly points: number) { }
}

export class PointsAdded implements IEvDbEvent {
    public readonly eventType: string = 'PointsAdded';

    constructor(
        payload: PointsAddedPayload,
        capturedBy: string = 'N/A',
        capturedAt: Date = new Date(Date.now()),
        storedAt?: Date
    ) {
        super(payload, capturedAt, capturedBy, storedAt);
    }
}

export class PointsSubtractedPayload implements IEvDbPayload {
    constructor(public readonly points: number) { }
}

export class PointsSubtracted implements IEvDbEvent {
    public readonly eventType: string = 'PointsSubtracted';

    constructor(
        payload: PointsSubtractedPayload,
        capturedBy: string = 'N/A',
        capturedAt: Date = new Date(Date.now()),
        storedAt?: Date
    ) {
        super(payload, capturedAt, capturedBy, storedAt);
    }
}

export class PointsMultipliedPayload implements IEvDbPayload {
    constructor(public readonly multiplier: number) { }
}

export class PointsMultiplied implements IEvDbEvent {
    public readonly eventType: string = 'PointsMultiplied';

    constructor(
        payload: PointsMultipliedPayload,
        capturedBy: string = 'N/A',
        capturedAt: Date = new Date(Date.now()),
        storedAt?: Date
    ) {
        super(payload, capturedAt, capturedBy, storedAt);
    }
}

export type PointsStreamEvents = PointsAdded | PointsSubtracted | PointsMultiplied;