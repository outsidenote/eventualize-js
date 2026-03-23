import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType";

export class PointsSubtracted implements IEvDbEventType {
  readonly eventType = "PointsSubtracted";
  constructor(public readonly points: number) {}
}
