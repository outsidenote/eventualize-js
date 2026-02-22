import type IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";

export class PointsAdded implements IEvDbEventPayload {
  readonly payloadType = "PointsAdded";
  constructor(public readonly points: number) {}
}

export class PointsSubtracted implements IEvDbEventPayload {
  readonly payloadType = "PointsSubtracted";
  constructor(public readonly points: number) {}
}

export class PointsMultiplied implements IEvDbEventPayload {
  readonly payloadType = "PointsMultiplied";
  constructor(public readonly multiplier: number) {}
}

export type PointsStreamEvents = PointsAdded | PointsSubtracted | PointsMultiplied;
