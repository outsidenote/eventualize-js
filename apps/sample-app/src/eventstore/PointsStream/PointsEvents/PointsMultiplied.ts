import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType";

export class PointsMultiplied implements IEvDbEventType {
  readonly eventType = "PointsMultiplied";
  constructor(public readonly multiplier: number) {}
}
