import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type IEvDbEventMetadata from "./IEvDbEventMetadata.js";
import type { IEvDbPayloadData } from "./IEvDbPayloadData.js";

export default class EvDbEvent implements IEvDbEventMetadata {
  constructor(
    public readonly eventType: string,
    public readonly streamCursor: EvDbStreamCursor,
    public readonly payload: IEvDbPayloadData,
    public readonly capturedAt: Date = new Date(Date.now()),
    public readonly capturedBy: string = "N/A",
    public readonly storedAt?: Date,
  ) { }
}
