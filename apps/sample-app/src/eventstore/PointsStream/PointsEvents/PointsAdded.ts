import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class PointsAdded implements IEvDbEventPayload {
  readonly payloadType = "PointsAdded";
  constructor(public readonly points: number) {}
}
