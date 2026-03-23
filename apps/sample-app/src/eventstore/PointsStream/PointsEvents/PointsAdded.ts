import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType";

export class PointsAdded implements IEvDbEventType {
  readonly eventType = "PointsAdded";
  constructor(public readonly points: number) {}
}
