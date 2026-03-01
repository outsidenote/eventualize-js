import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class PointsSubtracted implements IEvDbEventPayload {
  readonly payloadType = "PointsSubtracted";
  [key: string]: unknown;
  constructor(public readonly points: number) {}
}
