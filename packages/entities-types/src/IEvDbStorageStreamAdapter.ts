import EvDbStreamCursor from "./EvDbStreamCursor.js";
import EvDbEvent from "./EvDbEvent.js";
import EvDbMessage from "./EvDbMessage.js";
import EvDbStreamAddress from "./EvDbStreamAddress.js";
import StreamStoreAffected from "./StreamStoreAffected.js";
import IEvDbChangeStream from "./IEvDbChangeStream.js";

export default interface IEvDbStorageStreamAdapter extends IEvDbChangeStream {
    /**
     * Gets stored events.
     * @param streamCursor - The streamCursor.
     * @returns Async iterable of EvDbEvent
     */
    getEvents(
        streamCursor: EvDbStreamCursor,
        cancellation?: AbortSignal
    ): Promise<AsyncIterable<EvDbEvent>>;

    /**
     * Gets last stored event's offset.
     * Used when getting a stream that has no views.
     * In this case the last offset fetched from the events rather than views.
     * @param address - The stream address
     * @returns Promise resolving to the last offset
     */
    getLastOffsetAsync(
        address: EvDbStreamAddress,
    ): Promise<number>;

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
}