import type EvDbStreamCursor from "./EvDbStreamCursor.js";
import type EvDbEvent from "./EvDbEvent.js";
import type EvDbMessage from "./EvDbMessage.js";
import type EvDbStreamAddress from "./EvDbStreamAddress";
import type StreamStoreAffected from "./StreamStoreAffected.js";
import type IEvDbChangeStream from "./IEvDbChangeStream.js";

export default interface IEvDbStorageStreamAdapter extends IEvDbChangeStream {
  /**
   * Gets stored events.
   * @param streamCursor - The streamCursor.
   * @returns Async iterable of EvDbEvent
   */
  getEventsAsync(streamCursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined>;

  /**
   * Gets last stored event's offset.
   * Used when getting a stream that has no views.
   * In this case the last offset fetched from the events rather than views.
   * @param address - The stream address
   * @returns Promise resolving to the last offset
   */
  getLastOffsetAsync(address: EvDbStreamAddress): Promise<number>;

  /**
   * Saves the pending events to the stream
   * @param events - The events to save
   * @param messages - The messages to save.
   * @returns Promise resolving to count of added events
   */
  storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected>;

  /**
   * Close the storage adapter connection
   * @returns Promise of void
   */
  close(): Promise<void>;
}
