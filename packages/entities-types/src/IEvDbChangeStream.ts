import { EvDbShardName } from "./primitiveTypes";
import EvDbMessageFilter from "./EvDbMessageFilter";
import EvDbContinuousFetchOptions from "./EvDbContinuousFetchOptions";
import EvDbMessage from "./EvDbMessage";



export default interface IEvDbChangeStream {
    /**
     * Gets stream of stored messages.
     * @param filter - filtering options use `EvDbMessageFilter.Builder` for the filter creation.
     * @param options - Options for the continuous fetch.
     * @returns Stream of messages
     */
    getFromOutbox(
        filter: EvDbMessageFilter,
        options?: EvDbContinuousFetchOptions | null,
    ): Promise<AsyncIterable<EvDbMessage>>;

    /**
     * Gets stream of stored messages.
     * @param shard - The shard (table/collection) of the messages
     * @param filter - filtering options use `EvDbMessageFilter.Builder` for the filter creation.
     * @param options - Options for the continuous fetch.
     * @param cancellation - The cancellation.
     * @returns Stream of messages
     */
    getFromOutboxAsync(
        shard: EvDbShardName,
        filter: EvDbMessageFilter,
        options?: EvDbContinuousFetchOptions | null,
        cancellation?: AbortSignal
    ): AsyncIterable<EvDbMessage>;

    /**
     * Gets stored messages.
     * @param filter - filtering options use `EvDbMessageFilter.Builder` for the filter creation.
     * @param options - Options for the continuous fetch.
     * @param cancellation - The cancellation.
     * @returns Stream of messages
     */
    getRecordsFromOutboxAsync(
        filter: EvDbMessageFilter,
        options?: EvDbContinuousFetchOptions | null,
        cancellation?: AbortSignal
    ): AsyncIterable<EvDbMessage>;

    /**
     * Gets stream of stored messages.
     * @param shard - The shard (table/collection) of the messages
     * @param filter - filtering options use `EvDbMessageFilter.Builder` for the filter creation.
     * @param options - Options for the continuous fetch.
     * @param cancellation - The cancellation.
     * @returns Stream of messages
     */
    getRecordsFromOutboxAsync(
        shard: EvDbShardName,
        filter: EvDbMessageFilter,
        options?: EvDbContinuousFetchOptions | null,
        cancellation?: AbortSignal
    ): AsyncIterable<EvDbMessage>;

    /**
     * Subscribe to a stream of stored messages into via Dataflow Block.
     * You can control the concurrency and back pressure of the Dataflow Block to control how many messages will be processed in parallel and BoundedCapacity.
     * Complete the Dataflow Block when the stream is completed or cancelled.
     * @param handler - The subscription handler
     * @param filter - filtering options use `EvDbMessageFilter.Builder` for the filter creation.
     * @param options - Options for the continuous fetch.
     */
    subscribeToMessageAsync(
        handler: (message: EvDbMessage) => Promise<void>,
        filter: EvDbMessageFilter,
        options?: EvDbContinuousFetchOptions | null,
    ): Promise<void>;

    /**
     * Subscribe to a stream of stored messages into via Dataflow Block.
     * You can control the concurrency and back pressure of the Dataflow Block to control how many messages will be processed in parallel and BoundedCapacity.
     * Complete the Dataflow Block when the stream is completed or cancelled.
     * @param handler - The subscription handler
     * @param shard - The shard (table/collection) of the messages
     * @param filter - filtering options use `EvDbMessageFilter.Builder` for the filter creation.
     * @param options - Options for the continuous fetch.
     */
    subscribeToMessageAsync(
        handler: (message: EvDbMessage) => Promise<void>,
        shard: EvDbShardName,
        filter: EvDbMessageFilter,
        options?: EvDbContinuousFetchOptions | null,
    ): Promise<void>;
}