import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type EvDbEvent from "../events/EvDbEvent.js";
import type EvDbMessage from "../messages/EvDbMessage.js";
import type EvDbStreamAddress from "../stream/EvDbStreamAddress.js";
import type StreamStoreAffected from "../stream/StreamStoreAffected.js";
import type IEvDbChangeStream from "../stream/IEvDbChangeStream.js";

export default interface IEvDbStorageStreamAdapter extends IEvDbChangeStream {
  /**
   * Gets stored events, in ascending offset order, starting at
   * `streamCursor.offset` (inclusive). Each event is yielded exactly once.
   * @param streamCursor - The stream address and the first offset to read.
   * @param pageSize - Rows fetched per storage query (default 100).
   * @returns Async iterable of EvDbEvent
   */
  getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize?: number,
  ): AsyncGenerator<EvDbEvent, void, undefined>;

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
