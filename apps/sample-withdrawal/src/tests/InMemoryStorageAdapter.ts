import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbMessageFilter from "@eventualize/types/messages/EvDbMessageFilter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type EvDbContinuousFetchOptions from "@eventualize/types/primitives/EvDbContinuousFetchOptions";
import type { EvDbShardName } from "@eventualize/types/primitives/EvDbShardName";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";

export default class InMemoryStorageAdapter
  implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter
{
  private readonly events = new Map<string, EvDbEvent[]>();
  private readonly snapshots = new Map<string, EvDbStoredSnapshotResultRaw>();

  private streamKey(address: EvDbStreamAddress): string {
    return `${address.streamType}:${address.streamId}`;
  }

  private viewKey(address: EvDbViewAddress): string {
    return `${address.streamType}:${address.streamId}:${address.viewName}`;
  }

  async getLastOffsetAsync(address: EvDbStreamAddress): Promise<number> {
    const stored = this.events.get(this.streamKey(address)) ?? [];
    return stored.length > 0 ? stored[stored.length - 1].streamCursor.offset : 0;
  }

  async *getEventsAsync(cursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined> {
    const key = this.streamKey(cursor);
    const stored = this.events.get(key) ?? [];
    for (const event of stored) {
      if (event.streamCursor.offset >= cursor.offset) {
        yield event;
      }
    }
  }

  async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    _messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    if (events.length === 0) return StreamStoreAffected.Empty;
    const key = this.streamKey(events[0].streamCursor);
    const stored = this.events.get(key) ?? [];
    this.events.set(key, [...stored, ...events]);
    return new StreamStoreAffected(events.length, new Map());
  }

  async getSnapshotAsync(viewAddress: EvDbViewAddress): Promise<EvDbStoredSnapshotResultRaw> {
    return this.snapshots.get(this.viewKey(viewAddress)) ?? EvDbStoredSnapshotResultRaw.Empty;
  }

  async storeSnapshotAsync(snapshotData: EvDbStoredSnapshotData): Promise<void> {
    const key = `${snapshotData.streamType}:${snapshotData.streamId}:${snapshotData.viewName}`;
    this.snapshots.set(
      key,
      new EvDbStoredSnapshotResultRaw(snapshotData.offset, new Date(), snapshotData.state),
    );
  }

  async close(): Promise<void> {}

  // Outbox methods — not exercised in behaviour tests
  getFromOutbox(
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
  ): Promise<AsyncIterable<EvDbMessage>> {
    throw new Error("Not implemented");
  }

  getFromOutboxAsync(
    _shard: EvDbShardName,
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
    _cancellation?: AbortSignal,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Not implemented");
  }

  getRecordsFromOutboxAsync(
    _filterOrShard: EvDbMessageFilter | EvDbShardName,
    _filterOrOptions?: EvDbMessageFilter | EvDbContinuousFetchOptions | null,
    _optionsOrCancellation?: EvDbContinuousFetchOptions | AbortSignal | null,
    _cancellation?: AbortSignal,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Not implemented");
  }

  subscribeToMessageAsync(
    _handler: (message: EvDbMessage) => Promise<void>,
    _filterOrShard: EvDbMessageFilter | EvDbShardName,
    _filterOrOptions?: EvDbMessageFilter | EvDbContinuousFetchOptions | null,
    _options?: EvDbContinuousFetchOptions | null,
  ): Promise<void> {
    throw new Error("Not implemented");
  }
}
