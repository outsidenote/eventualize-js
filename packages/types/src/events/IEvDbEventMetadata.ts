import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";

export default interface IEvDbEventMetadata {
  /**
   * The full address of the stream including the offset
   */
  readonly streamCursor: EvDbStreamCursor;

  /**
   * The type of the event
   */
  readonly eventType: string;

  /**
   * The time of capturing the event (client side time)
   */
  readonly capturedAt: Date;

  readonly storedAt?: Date | null;

  /**
   * The user that captured the event
   */
  readonly capturedBy: string;
}
