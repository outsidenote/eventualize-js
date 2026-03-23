import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type IEvDbEventMetadata from "./IEvDbEventMetadata.js";
import type IEvDbEventType from "./IEvDbEventType.js";

export default class EvDbEvent implements IEvDbEventMetadata {
  constructor(
    public readonly eventType: string,
    public readonly streamCursor: EvDbStreamCursor,
    public readonly payload: IEvDbEventType,
    public readonly capturedAt: Date = new Date(Date.now()),
    public readonly capturedBy: string = "N/A",
    public readonly storedAt?: Date,
  ) {}
}
