import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type IEvDbEventType from "./IEvDbEventType.js";

export default interface IEvDbEventMetadata extends IEvDbEventType {
  /**
   * The full address of the stream including the offset
   */
  readonly streamCursor: EvDbStreamCursor;

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
