import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class PointsSubtracted implements IEvDbEventPayload {
  readonly payloadType = "PointsSubtracted";
  constructor(public readonly points: number) {}
}
