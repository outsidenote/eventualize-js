import { unmarshall } from "@aws-sdk/util-dynamodb";

import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import type EvDbContinuousFetchOptions from "@eventualize/types/primitives/EvDbContinuousFetchOptions";
import type EvDbMessageFilter from "@eventualize/types/messages/EvDbMessageFilter";
import type { EvDbShardName } from "@eventualize/types/primitives/EvDbShardName";

import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { DynamoDBClientOptions } from "./DynamoDbClient.js";
import { createDynamoDBClient } from "./DynamoDbClient.js";
import type { MessageRecord } from "./EvDbDynamoDbStorageAdapterQueries.js";
import QueryProvider, {
  deserializeStreamAddress,
  EventRecord,
} from "./EvDbDynamoDbStorageAdapterQueries.js";
import type { AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { TransactionCanceledException, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";

const TRACER_NAME = "@eventualize/dynamodb-adapter";
const TRACER_VERSION = "6.0.0";
const getTracer = () => trace.getTracer(TRACER_NAME, TRACER_VERSION);

/**
 * DynamoDB storage adapter for EvDb
 */
export default class EvDbDynamoDbStorageAdapter
  implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter
{
  /**
   * Creates a DynamoDB storage adapter.
   * @param dynamoDbClientOrOptions - Either a DynamoDBClient instance or configuration options.
   *        If options are provided, a new client will be created. Falls back to env vars if not provided.
   */
  constructor(private dynamoDbClient: DynamoDBClient = createDynamoDBClient()) {}

  /**
   * Factory method to create adapter with configuration options.
   * @param options - DynamoDB client configuration options.
   */
  static withOptions(options: DynamoDBClientOptions): EvDbDynamoDbStorageAdapter {
    return new EvDbDynamoDbStorageAdapter(createDynamoDBClient(options));
  }
  getFromOutbox(
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
  ): Promise<AsyncIterable<EvDbMessage>> {
    throw new Error("Method not implemented.");
  }
  getFromOutboxAsync(
    _shard: EvDbShardName,
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
    _cancellation?: AbortSignal,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Method not implemented.");
  }
  getRecordsFromOutboxAsync(
    filter: EvDbMessageFilter,
    options?: EvDbContinuousFetchOptions | null,
    cancellation?: AbortSignal,
  ): AsyncIterable<EvDbMessage>;
  getRecordsFromOutboxAsync(
    shard: EvDbShardName,
    filter: EvDbMessageFilter,
    options?: EvDbContinuousFetchOptions | null,
    cancellation?: AbortSignal,
  ): AsyncIterable<EvDbMessage>;
  getRecordsFromOutboxAsync(
    _shard: unknown,
    _filter?: unknown,
    _options?: unknown,
    _cancellation?: unknown,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Method not implemented.");
  }
  subscribeToMessageAsync(
    handler: (message: EvDbMessage) => Promise<void>,
    filter: EvDbMessageFilter,
    options?: EvDbContinuousFetchOptions | null,
  ): Promise<void>;
  subscribeToMessageAsync(
    handler: (message: EvDbMessage) => Promise<void>,
    shard: EvDbShardName,
    filter: EvDbMessageFilter,
    options?: EvDbContinuousFetchOptions | null,
  ): Promise<void>;
  subscribeToMessageAsync(
    _handler: unknown,
    _shard: unknown,
    _filter?: unknown,
    _options?: unknown,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  /**
   * Store stream events in a transaction
   */
  async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    return getTracer().startActiveSpan(
      "eventualize.adapter.store",
      { attributes: { "eventualize.adapter.kind": "dynamodb", "eventualize.event.count": events.length } },
      async (span) => {
        try {
          const eventsToInsert: EventRecord[] = events.map((event) =>
            EventRecord.createFromEvent(event),
          );

          const messagesToInsert: MessageRecord[] = messages.map((message) => {
            return {
              id: crypto.randomUUID(),
              stream_cursor: message.streamCursor,
              channel: message.channel,
              message_type: message.messageType,
              event_type: message.eventType,
              captured_by: message.capturedBy,
              captured_at: message.capturedAt,
              payload: message.payload as IEvDbPayloadData,
            };
          });

          const storeEventsQuery = QueryProvider.saveEvents(eventsToInsert);
          const storeMessagesQuery = QueryProvider.saveMessages(messagesToInsert);
          const transactItems = { TransactItems: [...storeEventsQuery, ...storeMessagesQuery] };
          const command = new TransactWriteItemsCommand(transactItems);
          await this.dynamoDbClient.send(command);

          const numEvents = eventsToInsert.length;
          const numMessages = messagesToInsert.reduce(
            (prev, { message_type: t }) => Object.assign(prev, { [t]: (prev[t] ?? 0) + 1 }),
            {} as Record<string, number>,
          );
          span.setStatus({ code: SpanStatusCode.OK });
          return new StreamStoreAffected(numEvents, new Map(Object.entries(numMessages)));
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
          if (error instanceof Error) span.recordException(error);
          if (this.isOccException(error)) {
            throw new Error("OPTIMISTIC_CONCURRENCY_VIOLATION");
          }
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Store outbox messages in a transaction
   */
  async storeOutboxMessagesAsync(
    _shardName: EvDbShardName,
    _records: EvDbMessage[],
  ): Promise<number> {
    throw new Error("Method not implemented.");
  }

  /**
   * Get the last offset for a stream
   */
  async getLastOffsetAsync(streamAddress: EvDbStreamAddress): Promise<number> {
    const query = QueryProvider.getLastOffset(streamAddress);
    const response = await this.dynamoDbClient.send(query);
    if (!response.Items) {
      return -1;
    }
    return parseInt(response.Items[0]?.offset.N ?? "-1", 10);
  }

  /**
   * Get events for a stream since a specific offset
   */
  async *getEventsAsync(
    streamCursor: EvDbStreamCursor,
    _pageSize: number = 100,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
    const span = getTracer().startSpan("eventualize.adapter.query.stream", {
      attributes: {
        "eventualize.adapter.kind": "dynamodb",
        "eventualize.stream.id": streamCursor.streamId,
        "eventualize.stream.type": streamCursor.streamType,
      },
    });
    try {
      let queryCursor: Record<string, AttributeValue> | undefined = undefined;

      do {
        const getEventsCommand = QueryProvider.getEvents(streamCursor);
        const response = await this.dynamoDbClient.send(getEventsCommand);

        if (response.Items && response.Items.length > 0) {
          for (const item of response.Items) {
            const res = unmarshall(item);
            const streamAddress = deserializeStreamAddress(res.stream_address);
            const r: EventRecord = new EventRecord(
              crypto.randomUUID(),
              new EvDbStreamCursor(streamAddress.streamType, streamAddress.streamId, res.offset),
              res.event_type,
              res.captured_by,
              new Date(res.captured_at),
              res.payload,
              new Date(res.stored_at),
            );
            yield r.toEvDbEvent();
          }
        }

        queryCursor = response.LastEvaluatedKey;
      } while (queryCursor);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
      if (error instanceof Error) span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get snapshot for a stream view
   */
  async getSnapshotAsync(viewAddress: EvDbViewAddress): Promise<EvDbStoredSnapshotResultRaw> {
    const query = QueryProvider.getSnapshot(viewAddress);
    const response = await this.dynamoDbClient.send(query);

    if (!response.Items || response.Items.length === 0) {
      return EvDbStoredSnapshotResultRaw.Empty;
    }

    const snapshot = unmarshall(response.Items[0]);

    return new EvDbStoredSnapshotResultRaw(
      snapshot.offset,
      new Date(Number(snapshot.stored_at)),
      snapshot.state.__state,
    );
  }

  /**
   * Save a snapshot
   */
  async storeSnapshotAsync(record: EvDbStoredSnapshotData): Promise<void> {
    const command = QueryProvider.saveSnapshot(record);
    await this.dynamoDbClient.send(command);
  }

  /**
   * Check if an exception is an optimistic concurrency conflict
   */
  private isOccException(error: unknown): boolean {
    if (!(error instanceof TransactionCanceledException)) {
      return false;
    }
    return !!(error as TransactionCanceledException).CancellationReasons?.some(
      ({ Code }) => Code === "ConditionalCheckFailed",
    );
  }

  /**
   * Get table name for shard
   */
  private getTableNameForShard(_shardName: EvDbShardName): string {
    throw new Error("Method not implemented.");
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    return;
  }
}
