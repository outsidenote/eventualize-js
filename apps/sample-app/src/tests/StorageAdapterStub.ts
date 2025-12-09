import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import { EvDbStoredSnapshotData } from '@eventualize/types/EvDbStoredSnapshotData';
import { EvDbStoredSnapshotResultRaw } from '@eventualize/types/EvDbStoredSnapshotResult';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import EvDbContinuousFetchOptions from '@eventualize/types/EvDbContinuousFetchOptions';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import EvDbMessage from '@eventualize/types/EvDbMessage';
import EvDbMessageFilter from '@eventualize/types/EvDbMessageFilter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import { EvDbShardName } from '@eventualize/types/primitiveTypes';
import StreamStoreAffected from '@eventualize/types/StreamStoreAffected';


export default class StorageAdapterStub implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter {
    close(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    getEventsAsync(streamCursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined> {
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
    getRecordsFromOutboxAsync(shard: unknown, filter?: unknown, options?: unknown, cancellation?: unknown): AsyncIterable<EvDbMessage> {
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