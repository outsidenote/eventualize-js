import { IEvDbPayloadData } from '@eventualize/types/IEvDbEventPayload';
import IEvDbEventMetadata from '@eventualize/types/IEvDbEventMetadata';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import EvDbMessage from '@eventualize/types/EvDbMessage';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import { EvDbStoredSnapshotResultRaw } from '@eventualize/types/EvDbStoredSnapshotResult';
import { EvDbStoredSnapshotData } from '@eventualize/types/EvDbStoredSnapshotData';
import EvDbEvent from '@eventualize/types/EvDbEvent';
import StreamStoreAffected from '@eventualize/types/StreamStoreAffected';
import EvDbContinuousFetchOptions from '@eventualize/types/EvDbContinuousFetchOptions';
import EvDbMessageFilter from '@eventualize/types/EvDbMessageFilter';
import { EvDbShardName } from '@eventualize/types/primitiveTypes';

// import { Prisma } from './generated/prisma/client.js';
import { PrismaQueryProvider } from './EvDbRelationalStorageAdapterQueries.js';
// import { eventsCreateManyInput } from './generated/prisma/models';

// Type definitions for records
export interface EvDbEventRecord extends IEvDbEventMetadata {
    id: string;
    payload: IEvDbPayloadData;
}

export interface EvDbSnapshotRecord {
    id: string;
    streamType: string;
    streamId: string;
    viewName: string;
    offset: bigint;
    state: IEvDbPayloadData;
}

export interface IEvDbOutboxTransformer {
    transform(message: EvDbMessage): EvDbMessage;
}

export interface EvDbStorageContext {
    schema?: string;
    shortId: string;
    id: string;
}

const serializePayload = (payload: IEvDbPayloadData) => Buffer.from(JSON.stringify(payload), 'utf-8');
const deserializePayload = (payload: any): IEvDbPayloadData => {
    if (!!payload && typeof payload == 'object') {
        return payload;
    }
    return {};
}

/**
 * Prisma-based storage adapter for EvDb
 * Replaces SQL Server-specific adapter with database-agnostic Prisma implementation
 */
export class EvDbPrismaStorageAdapter implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter {
    private readonly queryProvider: PrismaQueryProvider;
    protected readonly databaseType: string = 'prisma';

    constructor(
        private readonly prisma: any,
    ) {
        this.queryProvider = new PrismaQueryProvider(prisma);
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

    /**
     * Store stream events in a transaction
     */
    async storeStreamAsync(
        events: ReadonlyArray<EvDbEvent>,
        messages: ReadonlyArray<EvDbMessage>,
    ): Promise<StreamStoreAffected> {
        try {
            const eventsToInsert = events.map((event) => {
                const streamCursor = event.streamCursor as EvDbStreamCursor;
                return {
                    id: crypto.randomUUID(),
                    stream_type: streamCursor.streamType,
                    stream_id: streamCursor.streamId,
                    offset: streamCursor.offset,
                    event_type: event.eventType,
                    captured_by: event.capturedBy,
                    captured_at: event.capturedAt,
                    payload: event.payload,
                }
            });

            const queryResult = await this.queryProvider.saveEvents(eventsToInsert)
            const numEvents = queryResult.count;
            return new StreamStoreAffected(numEvents, undefined);
        } catch (error) {
            if (this.isOccException(error)) {
                throw new Error('OPTIMISTIC_CONCURRENCY_VIOLATION');
            }
            throw error;
        }
    }

    /**
     * Store outbox messages in a transaction
     */
    async storeOutboxMessagesAsync(
        shardName: EvDbShardName,
        records: EvDbMessage[],
    ): Promise<number> {
        throw new Error('Method not implemented.');
    }

    /**
     * Get the last offset for a stream
     */
    async getLastOffsetAsync(
        streamAddress: EvDbStreamAddress
    ): Promise<number> {
        try {
            const { streamType, streamId } = streamAddress;
            const result = await this.queryProvider.getLastOffset(streamType, streamId);
            return Number(result?.offset ?? -1);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get events for a stream since a specific offset
     */
    async *getEventsAsync(
        streamCursor: EvDbStreamCursor,
        pageSize: number = 100
    ): AsyncGenerator<EvDbEvent, void, undefined> {
        const { streamType, streamId } = streamCursor;
        let currentOffset = streamCursor.offset;
        while (true) {
            try {
                const events = await this.queryProvider.getEvents(
                    streamType,
                    streamId,
                    currentOffset
                );

                if (events.length === 0) {
                    break;
                }

                for (const event of events) {
                    yield new EvDbEvent(
                        event.event_type,
                        new EvDbStreamCursor(event.stream_type, event.stream_id, Number(event.offset)),
                        { payloadType: event.event_type, payload: deserializePayload(event.payload) },
                        event.captured_at,
                        event.captured_by, event.stored_at
                    );
                    currentOffset = Math.max(currentOffset, Number(event.offset))
                }

                if (events.length < pageSize) {
                    break; // Reached the end of the stream in the last page
                }
            } catch (error) {
                throw error;
            }
        }
    }

    /**
     * Get messages from outbox with optional filtering
     */
    async getMessagesAsync(
        shardName: EvDbShardName,
        sinceDate: Date,
        channels?: string[],
        messageTypes?: string[],
        cancellationToken?: AbortSignal
    ): Promise<EvDbMessage[]> {
        try {
            const tableName = this.getTableNameForShard(shardName);
            const messages = await this.queryProvider.getMessages(
                tableName,
                sinceDate,
                channels,
                messageTypes
            );

            return messages as EvDbMessage[];
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get snapshot for a stream view
     */
    async getSnapshotAsync(
        viewAddress: EvDbViewAddress
    ): Promise<EvDbStoredSnapshotResultRaw> {
        const { streamType, streamId, viewName } = viewAddress;
        try {
            const snapshot = await this.queryProvider.getSnapshot(
                streamType,
                streamId,
                viewName
            );

            if (!snapshot) return EvDbStoredSnapshotResultRaw.Empty;

            return new EvDbStoredSnapshotResultRaw(
                Number(snapshot.offset),
                snapshot.stored_at,
                deserializePayload(snapshot.state),
            );
        } catch (error) {
            throw error;
        }
    }

    /**
     * Save a snapshot
     */
    async storeSnapshotAsync(record: EvDbStoredSnapshotData): Promise<void> {
        try {
            await this.queryProvider.saveSnapshot({
                id: record.id,
                stream_type: record.streamType,
                stream_id: record.streamId,
                view_name: record.viewName,
                offset: record.offset,
                state: record.state,
                stored_at: new Date(),
            });

        } catch (error) {
            throw error;
        }
    }

    /**
     * Check if an exception is an optimistic concurrency conflict
     */
    private isOccException(error: unknown): boolean {
        // P2002 = Unique constraint violation
        // P2034 = Transaction conflict
        const anyError = error as any;
        return !!error && anyError?.code === 'P2002' || anyError.code === 'P2034';
    }

    /**
     * Get table name for shard
     */
    private getTableNameForShard(shardName: EvDbShardName): string {
        throw new Error('Method not implemented.');
    }

    /**
     * Close the database connection
     */
    async close(): Promise<void> {
        await this.prisma.$disconnect();
    }
}

export default EvDbPrismaStorageAdapter;