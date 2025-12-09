import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";

export class PointsAdded implements IEvDbEventPayload {
    readonly payloadType = 'PointsAdded';
    constructor(public readonly points: number) { }
}

export class PointsSubtracted implements IEvDbEventPayload {
    readonly payloadType = 'PointsSubtracted';
    constructor(public readonly points: number) { }
}

export type PointsStreamEvents = PointsAdded | PointsSubtracted;