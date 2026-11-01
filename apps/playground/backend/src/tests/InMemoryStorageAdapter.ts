import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbMessageFilter from "@eventualize/types/messages/EvDbMessageFilter";
import type EvDbContinuousFetchOptions from "@eventualize/types/primitives/EvDbContinuousFetchOptions";
import type { EvDbShardName } from "@eventualize/types/primitives/EvDbShardName";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type { EvDbSnapshotBody } from "@eventualize/types/snapshots/EvDbSnapshotBody";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";

interface StoredSnapshot {
  readonly offset: number;
  readonly body: EvDbSnapshotBody;
}

const streamKey = (a: EvDbStreamAddress): string => `${a.streamType}/${a.streamId}`;
const viewKey = (a: EvDbViewAddress): string => `${a.streamType}/${a.streamId}/${a.viewName}`;

/** In-memory stream + snapshot adapter for playground unit tests (copy of the core test-support adapter). */
export default class InMemoryStorageAdapter implements IEvDbStorageAdapter {
  private readonly events = new Map<string, EvDbEvent[]>();
  private readonly snapshots = new Map<string, StoredSnapshot[]>();
  public getEventsCalls = 0;
  public storedMessages: EvDbMessage[] = [];

  constructor(private readonly options: { ignoreMaxOffset?: boolean } = {}) {}

  seedEvents(events: ReadonlyArray<EvDbEvent>): void {
    for (const e of events) {
      const key = streamKey(e.streamCursor);
      const list = this.events.get(key) ?? [];
      list.push(e);
      list.sort((a, b) => a.streamCursor.offset - b.streamCursor.offset);
      this.events.set(key, list);
    }
  }

  seedSnapshot(viewAddress: EvDbViewAddress, offset: number, state: unknown): void {
    const key = viewKey(viewAddress);
    const list = this.snapshots.get(key) ?? [];
    list.push({ offset, body: { kind: "full", state } });
    list.sort((a, b) => a.offset - b.offset);
    this.snapshots.set(key, list);
  }

  async *getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize: number = 100,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
    this.getEventsCalls++;
    const all = this.events.get(streamKey(streamCursor)) ?? [];
    let next = streamCursor.offset;
    while (true) {
      const page = all.filter((e) => e.streamCursor.offset >= next).slice(0, pageSize);
      if (page.length === 0) return;
      for (const e of page) {
        yield e;
        next = e.streamCursor.offset + 1;
      }
      if (page.length < pageSize) return;
    }
  }

  async getLastOffsetAsync(address: EvDbStreamAddress): Promise<number> {
    const all = this.events.get(streamKey(address)) ?? [];
    return all.length === 0 ? -1 : all[all.length - 1].streamCursor.offset;
  }

  async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    const stored = events.map(
      (e) =>
        new EvDbEvent(
          e.eventType,
          new EvDbStreamCursor(e.streamCursor, e.streamCursor.offset),
          e.payload,
          e.capturedAt,
          e.capturedBy,
          new Date(),
          e.traceparent,
          e.tracestate,
        ),
    );
    this.seedEvents(stored);
    this.storedMessages = [...this.storedMessages, ...messages];
    return new StreamStoreAffected(events.length, undefined);
  }

  async getSnapshotAsync(
    viewAddress: EvDbViewAddress,
    maxOffset?: number,
  ): Promise<EvDbStoredSnapshotResultRaw> {
    const list = this.snapshots.get(viewKey(viewAddress)) ?? [];
    const bound = this.options.ignoreMaxOffset ? undefined : maxOffset;
    const candidates = bound === undefined ? list : list.filter((s) => s.offset <= bound);
    const latest = candidates[candidates.length - 1];
    if (!latest) return EvDbStoredSnapshotResultRaw.Empty;
    if (latest.body.kind === "full") {
      return new EvDbStoredSnapshotResultRaw(latest.offset, new Date(), latest.body.state, {
        kind: "row",
        offset: latest.offset,
      });
    }
    const ref = latest.body.stateRef;
    const row = ref.kind === "row" ? list.find((s) => s.offset === ref.offset) : undefined;
    const state = row?.body.kind === "full" ? row.body.state : undefined;
    return new EvDbStoredSnapshotResultRaw(latest.offset, new Date(), state, ref);
  }

  async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    const key = `${data.streamType}/${data.streamId}/${data.viewName}`;
    const list = this.snapshots.get(key) ?? [];
    list.push({ offset: data.offset, body: data.body });
    list.sort((a, b) => a.offset - b.offset);
    this.snapshots.set(key, list);
  }

  /** Number of stored snapshot rows for one view (test assertion helper). */
  countSnapshots(streamType: string, streamId: string, viewName: string): number {
    return (this.snapshots.get(`${streamType}/${streamId}/${viewName}`) ?? []).length;
  }

  async close(): Promise<void> {}

  // Outbox reading is not needed by core unit tests.

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
    _shardOrFilter: EvDbShardName | EvDbMessageFilter,
    _filterOrOptions?: EvDbMessageFilter | EvDbContinuousFetchOptions | null,
    _optionsOrCancellation?: EvDbContinuousFetchOptions | AbortSignal | null,
    _cancellation?: AbortSignal,
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
    _handler: (message: EvDbMessage) => Promise<void>,
    _shardOrFilter: EvDbShardName | EvDbMessageFilter,
    _filterOrOptions?: EvDbMessageFilter | EvDbContinuousFetchOptions | null,
    _options?: EvDbContinuousFetchOptions | null,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
