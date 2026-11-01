import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbSnapshotBody } from "@eventualize/types/snapshots/EvDbSnapshotBody";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import type EvDbContinuousFetchOptions from "@eventualize/types/primitives/EvDbContinuousFetchOptions";
import type EvDbMessageFilter from "@eventualize/types/messages/EvDbMessageFilter";
import type { EvDbShardName } from "@eventualize/types/primitives/EvDbShardName";
import { evDbTracerFor } from "@eventualize/types/telemetry/EvDbSpanPolicy";

import { trace, SpanStatusCode } from "@opentelemetry/api";
import { Prisma } from "./generated/prisma/client.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { PrismaQueryProvider } from "./EvDbRelationalStorageAdapterQueries.js";

const TRACER_NAME = "@eventualize/relational-adapter";
const TRACER_VERSION = "6.0.0";
const getTracer = () => trace.getTracer(TRACER_NAME, TRACER_VERSION);

const deserializePayload = (payload: unknown): IEvDbPayloadData => {
  if (!!payload && typeof payload == "object") {
    return payload as IEvDbPayloadData;
  }
  return {};
};

/**
 * Database behind the Prisma client. Reported as the `eventualize.adapter.kind`
 * span attribute. `"relational"` means the database is not specified.
 */
export type EvDbPrismaAdapterKind = "postgres" | "mysql" | "relational";

export interface EvDbPrismaStorageAdapterOptions {
  /** Default: `"relational"`. */
  kind?: EvDbPrismaAdapterKind;
}

/**
 * Prisma-based storage adapter for EvDb
 * Replaces SQL Server-specific adapter with database-agnostic Prisma implementation
 */
export class EvDbPrismaStorageAdapter
  implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter
{
  private readonly queryProvider: PrismaQueryProvider;
  protected readonly databaseType: string = "prisma";
  private readonly kind: EvDbPrismaAdapterKind;

  constructor(
    private readonly prisma: PrismaClient,
    options: EvDbPrismaStorageAdapterOptions = {},
  ) {
    this.queryProvider = new PrismaQueryProvider(prisma);
    this.kind = options.kind ?? "relational";
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
    return evDbTracerFor("eventualize.adapter.store", getTracer()).startActiveSpan(
      "eventualize.adapter.store",
      {
        attributes: {
          "eventualize.adapter.kind": this.kind,
          "eventualize.event.count": events.length,
        },
      },
      async (span) => {
        try {
          const result = await this._storeStreamAsync(events, messages);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
          if (error instanceof Error) span.recordException(error);
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  private async _storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    try {
      const eventsToInsert: Prisma.eventsCreateInput[] = events.map((event) => {
        const streamCursor = event.streamCursor as EvDbStreamCursor;
        return {
          id: crypto.randomUUID(),
          stream_type: streamCursor.streamType,
          stream_id: streamCursor.streamId,
          offset: streamCursor.offset,
          event_type: event.eventType,
          traceparent: event.traceparent,
          tracestate: event.tracestate,
          captured_by: event.capturedBy,
          captured_at: event.capturedAt,
          payload: event.payload as unknown as Prisma.InputJsonValue,
        };
      });

      const messagesToInsert: Prisma.outboxCreateInput[] = messages.map((message) => {
        const streamCursor = message.streamCursor as EvDbStreamCursor;
        return {
          id: message.id,
          stream_type: streamCursor.streamType,
          stream_id: streamCursor.streamId,
          offset: streamCursor.offset,
          event_type: message.eventType,
          channel: message.channel,
          message_type: message.messageType,
          traceparent: message.traceparent,
          tracestate: message.tracestate,
          captured_by: message.capturedBy,
          captured_at: message.capturedAt,
          stored_at: message.storedAt,
          payload: message.payload as unknown as Prisma.InputJsonValue,
          serialize_type: "json",
        };
      });

      const storeEventsQuery = this.queryProvider.saveEvents(eventsToInsert);
      const storeMessagesQuery = this.queryProvider.saveMessages(messagesToInsert);

      const queryResult = await this.prisma.$transaction([storeEventsQuery, storeMessagesQuery]);

      const numEvents = queryResult[0].count;
      const numMessages = messagesToInsert.reduce(
        (prev, { message_type: t }) => Object.assign(prev, { [t]: (prev[t] ?? 0) + 1 }),
        {} as Record<string, number>,
      );
      return new StreamStoreAffected(numEvents, new Map(Object.entries(numMessages)));
    } catch (error) {
      if (this.isOccException(error)) {
        throw new Error("OPTIMISTIC_CONCURRENCY_VIOLATION");
      }
      throw error;
    }
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
    const { streamType, streamId } = streamAddress;
    const result = await this.queryProvider.getLastOffset(streamType, streamId);
    return Number(result?.offset ?? -1);
  }

  /**
   * Get events for a stream since a specific offset, in ascending offset order.
   *
   * Reads `pageSize` rows per query and keeps paging until the end of the stream,
   * so stop iterating early when you need only a part of it.
   * @param streamCursor - The stream address and the first offset to read (inclusive).
   * @param pageSize - Rows fetched per query. Default 100.
   * @returns Async iterable of EvDbEvent
   */
  async *getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize: number = 100,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
    const tracer = evDbTracerFor("eventualize.adapter.query.stream", getTracer());
    const span = tracer.startSpan("eventualize.adapter.query.stream", {
      attributes: {
        "eventualize.adapter.kind": this.kind,
        "eventualize.stream.id": streamCursor.streamId,
        "eventualize.stream.type": streamCursor.streamType,
      },
    });
    try {
      const { streamType, streamId } = streamCursor;
      let nextOffset = streamCursor.offset;
      while (true) {
        const events = await this.queryProvider.getEvents(
          streamType,
          streamId,
          nextOffset,
          pageSize,
        );

        if (events.length === 0) {
          break;
        }

        for (const event of events) {
          yield new EvDbEvent(
            event.event_type,
            new EvDbStreamCursor(event.stream_type, event.stream_id, Number(event.offset)),
            deserializePayload(event.payload),
            event.captured_at,
            event.captured_by,
            event.stored_at,
            event.traceparent ?? undefined,
            event.tracestate ?? undefined,
          );
          nextOffset = Number(event.offset) + 1;
        }

        if (events.length < pageSize) {
          break;
        }
      }
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
   * Get messages from outbox with optional filtering
   */
  async getMessagesAsync(
    shardName: EvDbShardName,
    sinceDate: Date,
    channels?: string[],
    messageTypes?: string[],
    _cancellationToken?: AbortSignal,
  ): Promise<EvDbMessage[]> {
    const tableName = this.getTableNameForShard(shardName);
    const messages = await this.queryProvider.getMessages(
      tableName,
      sinceDate,
      channels,
      messageTypes,
    );

    return messages as EvDbMessage[];
  }

  /**
   * Get snapshot for a stream view
   * @param viewAddress - The view address.
   * @param maxOffset - Optional upper bound: return the latest snapshot whose offset
   *   is `<= maxOffset`.
   * @returns The stored snapshot, or an empty snapshot when none matches.
   */
  async getSnapshotAsync(
    viewAddress: EvDbViewAddress,
    maxOffset?: number,
  ): Promise<EvDbStoredSnapshotResultRaw> {
    const { streamType, streamId, viewName } = viewAddress;
    const snapshot = await this.queryProvider.getSnapshot(
      streamType,
      streamId,
      viewName,
      maxOffset,
    );

    if (!snapshot) return EvDbStoredSnapshotResultRaw.Empty;

    const offset = Number(snapshot.offset);
    if (snapshot.state_offset === null) {
      return new EvDbStoredSnapshotResultRaw(offset, snapshot.stored_at, undefined, {
        kind: "default",
      });
    }

    const stateOffset = Number(snapshot.state_offset);
    if (stateOffset === offset) {
      return new EvDbStoredSnapshotResultRaw(offset, snapshot.stored_at, snapshot.state, {
        kind: "row",
        offset,
      });
    }

    const pointerAt = `Snapshot pointer at offset ${offset} for ${streamType}/${streamId}/${viewName}`;
    // A pointer names an earlier (or equal) full row; a later one is from a corrupt or hand-written row.
    if (stateOffset > offset) {
      throw new Error(`${pointerAt} references a later state row at offset ${stateOffset}`);
    }
    const target = await this.queryProvider.getSnapshotState(
      streamType,
      streamId,
      viewName,
      stateOffset,
    );
    if (!target) {
      throw new Error(`${pointerAt} references missing state row at offset ${stateOffset}`);
    }
    // The target must be a full row: a pointer row (or default-state pointer) carries no state.
    if (target.state_offset === null || Number(target.state_offset) !== stateOffset) {
      throw new Error(
        `${pointerAt} references a row at offset ${stateOffset} that is not a full row ` +
          `(its state_offset is ${target.state_offset === null ? "null" : Number(target.state_offset)})`,
      );
    }
    return new EvDbStoredSnapshotResultRaw(offset, snapshot.stored_at, target.state, {
      kind: "row",
      offset: stateOffset,
    });
  }

  /**
   * Save a snapshot. A full body writes its state; a pointer body writes no state and
   * only the `state_offset` (null for a default-state pointer).
   */
  async storeSnapshotAsync(record: EvDbStoredSnapshotData): Promise<void> {
    const { body } = record;
    await this.queryProvider.saveSnapshot({
      id: record.id,
      stream_type: record.streamType,
      stream_id: record.streamId,
      view_name: record.viewName,
      offset: record.offset,
      ...this.toStateColumns(record.offset, body),
      stored_at: new Date(),
    });
  }

  private toStateColumns(
    offset: number,
    body: EvDbSnapshotBody,
  ): Pick<Prisma.snapshot_v2CreateInput, "state" | "state_offset"> {
    if (body.kind === "full") {
      // Owner-approved cast at the persistence boundary: view state is typed `unknown`
      // here and is assumed JSON-serializable. A runtime guard would cost O(state) per write.
      return {
        state: body.state === null ? Prisma.JsonNull : (body.state as Prisma.InputJsonValue),
        state_offset: offset,
      };
    }
    return body.stateRef.kind === "row" ? { state_offset: body.stateRef.offset } : {};
  }

  /**
   * Check if an exception is an optimistic concurrency conflict
   */
  private isOccException(error: unknown): boolean {
    // P2002 = Unique constraint violation
    // P2034 = Transaction conflict
    const errorObj = error as { code?: unknown };
    return !!error && (errorObj?.code === "P2002" || errorObj?.code === "P2034");
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
    await this.prisma.$disconnect();
  }
}

export default EvDbPrismaStorageAdapter;
