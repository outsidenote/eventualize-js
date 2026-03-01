import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class PointsMultiplied implements IEvDbEventPayload {
  readonly payloadType = "PointsMultiplied";
  [key: string]: unknown;
  constructor(public readonly multiplier: number) {}
}
