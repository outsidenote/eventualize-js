import IEvDbStorageSnapshotAdapter from '@eventualize/entities-types/IEvDbStorageSnapshotAdapter';
import EvDbViewAddress from '@eventualize/entities-types/EvDbViewAddress';
import { EvDbStoredSnapshotData } from '@eventualize/entities-types/EvDbStoredSnapshotData';
import { EvDbStoredSnapshotResultRaw } from '@eventualize/entities-types/EvDbStoredSnapshotResult';
import IEvDbStorageStreamAdapter from '@eventualize/entities-types/IEvDbStorageStreamAdapter';
import EvDbContinuousFetchOptions from '@eventualize/entities-types/EvDbContinuousFetchOptions';
import EvDbEvent from '@eventualize/entities-types/EvDbEvent';
import EvDbMessage from '@eventualize/entities-types/EvDbMessage';
import EvDbMessageFilter from '@eventualize/entities-types/EvDbMessageFilter';
import EvDbStreamAddress from '@eventualize/entities-types/EvDbStreamAddress';
import EvDbStreamCursor from '@eventualize/entities-types/EvDbStreamCursor';
import { EvDbShardName } from '@eventualize/entities-types/primitiveTypes';
import StreamStoreAffected from '@eventualize/entities-types/StreamStoreAffected';


export default class StorageAdapterStub implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter {
    getEvents(streamCursor: EvDbStreamCursor, cancellation?: AbortSignal): Promise<AsyncIterable<EvDbEvent>> {
        throw new Error('Method not implemented.');
    }
    getLastOffsetAsync(address: EvDbStreamAddress): Promise<number> {
        throw new Error('Method not implemented.');
    }
    storeStreamAsync(events: ReadonlyArray<EvDbEvent>, messages: ReadonlyArray<EvDbMessage>): Promise<StreamStoreAffected> {
        throw new Error('Method not implemented.');
    }
    getFromOutbox(filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null): Promise<AsyncIterable<EvDbMessage>> {
        throw new Error('Method not implemented.');
    }
    getFromOutboxAsync(shard: EvDbShardName, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null, cancellation?: AbortSignal): AsyncIterable<EvDbMessage> {
        throw new Error('Method not implemented.');
    }
    getRecordsFromOutboxAsync(filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null, cancellation?: AbortSignal): AsyncIterable<EvDbMessage>;
    getRecordsFromOutboxAsync(shard: EvDbShardName, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null, cancellation?: AbortSignal): AsyncIterable<EvDbMessage>;
    getRecordsFromOutboxAsync(shard: unknown, filter?: unknown, options?: unknown, cancellation?: unknown): AsyncIterable<import("@eventualize/entities-types/EvDbMessage").default> {
        throw new Error('Method not implemented.');
    }
    subscribeToMessageAsync(handler: (message: EvDbMessage) => Promise<void>, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null): Promise<void>;
    subscribeToMessageAsync(handler: (message: EvDbMessage) => Promise<void>, shard: EvDbShardName, filter: EvDbMessageFilter, options?: EvDbContinuousFetchOptions | null): Promise<void>;
    subscribeToMessageAsync(handler: unknown, shard: unknown, filter?: unknown, options?: unknown): Promise<void> {
        throw new Error('Method not implemented.');
    }
    getSnapshotAsync(viewAddress: EvDbViewAddress, signal?: AbortSignal): Promise<EvDbStoredSnapshotResultRaw> {
        throw new Error('Method not implemented.');
    }
    storeSnapshotAsync(snapshotData: EvDbStoredSnapshotData, signal?: AbortSignal): Promise<void> {
        throw new Error('Method not implemented.');
    }
}