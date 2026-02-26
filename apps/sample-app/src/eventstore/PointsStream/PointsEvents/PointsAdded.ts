import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

// TODO: export type PointsAdded = IEvDbEventPayload & { readonly payloadType: "PointsAdded"; readonly points: number };

export class PointsAdded implements IEvDbEventPayload {
  readonly payloadType = "PointsAdded";
  constructor(public readonly points: number) {}
}
