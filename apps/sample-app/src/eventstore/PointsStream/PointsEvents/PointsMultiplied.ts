import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class PointsMultiplied implements IEvDbEventPayload {
  readonly payloadType = "PointsMultiplied";
  constructor(public readonly multiplier: number) {}
}
