import type EvDbStreamCursor from "./EvDbStreamCursor.js";
import type IEvDbEventMetadata from "./IEvDbEventMetadata.js";
import type IEvDbEventPayload from "./IEvDbEventPayload.js";

export default class EvDbEvent implements IEvDbEventMetadata {
  constructor(
    public readonly eventType: string,
    public readonly streamCursor: EvDbStreamCursor,
    public readonly payload: IEvDbEventPayload,
    public readonly capturedAt: Date = new Date(Date.now()),
    public readonly capturedBy: string = "N/A",
    public readonly storedAt?: Date,
  ) {}
}
