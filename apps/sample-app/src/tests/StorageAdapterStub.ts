import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbContinuousFetchOptions from "@eventualize/types/primitives/EvDbContinuousFetchOptions";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbMessageFilter from "@eventualize/types/messages/EvDbMessageFilter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type { EvDbShardName } from "@eventualize/types/primitives/EvDbShardName";
import type StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";

export default class StorageAdapterStub
  implements IEvDbStorageSnapshotAdapter, IEvDbStorageStreamAdapter
{
  close(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getEventsAsync(_streamCursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined> {
    throw new Error("Method not implemented.");
  }
  getLastOffsetAsync(_address: EvDbStreamAddress): Promise<number> {
    throw new Error("Method not implemented.");
  }
  storeStreamAsync(
    _events: ReadonlyArray<EvDbEvent>,
    _messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    throw new Error("Method not implemented.");
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
  getSnapshotAsync(
    _viewAddress: EvDbViewAddress,
    _signal?: AbortSignal,
  ): Promise<EvDbStoredSnapshotResultRaw> {
    throw new Error("Method not implemented.");
  }
  storeSnapshotAsync(_snapshotData: EvDbStoredSnapshotData, _signal?: AbortSignal): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
