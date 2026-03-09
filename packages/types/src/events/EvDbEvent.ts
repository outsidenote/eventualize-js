import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type IEvDbEvent from "./IEvDbEventType.js";

export default class EvDbEvent implements IEvDbEvent {
  constructor(
    public readonly eventType: string,
    public readonly streamCursor: EvDbStreamCursor,
    public readonly payload: unknown,
    public readonly capturedAt: Date = new Date(Date.now()),
    public readonly capturedBy: string = "N/A",
    public readonly storedAt?: Date,
  ) {}
}
