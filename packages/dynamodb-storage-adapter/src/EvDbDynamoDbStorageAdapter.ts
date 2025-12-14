import { unmarshall } from "@aws-sdk/util-dynamodb";

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


import { createDynamoDBClient, listTables } from './DynamoDbClient.js';
import QueryProvider, { EventRecord, MessageRecord } from './EvDbDynamoDbStorageAdapterQueries.js'
import { ConditionalCheckFailedException, DynamoDBClient, TransactGetItemsCommandInput, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';

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
export default class EvDbDynamoDbStorageAdapter implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter {
    constructor(private dynamoDbClient: DynamoDBClient = createDynamoDBClient()) {
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
            await listTables(this.dynamoDbClient);
            const eventsToInsert: EventRecord[] = events.map((event) =>
                EventRecord.createFromEvent(event));

            const messagesToInsert: MessageRecord[] = messages.map(message => {
                return {
                    id: crypto.randomUUID(),
                    stream_cursor: message.streamCursor,
                    channel: message.channel,
                    message_type: message.messageType,
                    event_type: message.eventType,
                    captured_by: message.capturedBy,
                    captured_at: message.capturedAt,
                    payload: message.payload,
                }
            })

            const storeEventsQuery = QueryProvider.saveEvents(eventsToInsert);
            const storeMessagesQuery = QueryProvider.saveMessages(messagesToInsert);

            const transactItems = { TransactItems: [...storeEventsQuery, ...storeMessagesQuery] };

            const command = new TransactWriteItemsCommand(transactItems)
            await this.dynamoDbClient.send(command);

            const numEvents = eventsToInsert.length;
            const numMessages = messagesToInsert
                .reduce((prev, { message_type: t }) =>
                    Object.assign(prev, { [t]: (prev[t] ?? 0) + 1 }), {} as Record<string, number>);
            return new StreamStoreAffected(numEvents, new Map(Object.entries(numMessages)));
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
        const query = QueryProvider.getLastOffset(streamAddress);
        const response = await this.dynamoDbClient.send(query);
        if (!response.Items) {
            return -1;
        }
        return parseInt(response.Items[0]?.offset.N ?? '-1', 10);
    }

    /**
     * Get events for a stream since a specific offset
     */
    async *getEventsAsync(
        streamCursor: EvDbStreamCursor,
        pageSize: number = 100
    ): AsyncGenerator<EvDbEvent, void, undefined> {
        let queryCursor: Record<string, any> | undefined = undefined;

        do {
            const getEventsCommand = QueryProvider.getEvents(streamCursor);
            const response = await this.dynamoDbClient.send(getEventsCommand);

            if (response.Items && response.Items.length > 0) {
                for (const item of response.Items) {
                    const r: EventRecord = unmarshall(item) as EventRecord;
                    yield r.toEvDbEvent();
                }
            }

            queryCursor = response.LastEvaluatedKey;

        } while (queryCursor)
    }

    /**
     * Get snapshot for a stream view
     */
    async getSnapshotAsync(
        viewAddress: EvDbViewAddress
    ): Promise<EvDbStoredSnapshotResultRaw> {
        const { streamType, streamId, viewName } = viewAddress;
        try {
            const query = QueryProvider.getSnapshot(viewAddress);
            const response = await this.dynamoDbClient.send(query);

            if (!response.Items) {
                return EvDbStoredSnapshotResultRaw.Empty;
            }

            const snapshot = response.Items[0];

            return new EvDbStoredSnapshotResultRaw(
                Number(snapshot.offset),
                new Date(Number(snapshot.stored_at)),
                unmarshall(snapshot.state),
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
            const command = QueryProvider.saveSnapshot(record);
            await this.dynamoDbClient.send(command);

        } catch (error) {
            throw error;
        }
    }

    /**
     * Check if an exception is an optimistic concurrency conflict
     */
    private isOccException(error: unknown): boolean {
        return error instanceof ConditionalCheckFailedException;
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
        return;
    }
}