import type EvDbStream from "./EvDbStream.js";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type { EvDbStreamFactory } from "../factories/EvDbStreamFactory.js";
import type { StreamCreatorMethods } from "./EvDbEventStoreTypes.js";

/**
 * Storage configuration - either separate adapters or combined
 */
interface StorageConfig {
  streamAdapter: IEvDbStorageStreamAdapter;
  snapshotAdapter: IEvDbStorageSnapshotAdapter;
}

/**
 * Registry of stream factories by stream type
 */
interface StreamFactoryRegistry {
  [streamType: string]: EvDbStreamFactory<any, any>;
}

/**
 * Store class - manages stream creation with configured adapters and factories
 */
export class BaseStore {
  private readonly storage: StorageConfig;
  private readonly streamFactories: StreamFactoryRegistry = {};

  public constructor(storage: StorageConfig, streamFactories: StreamFactoryRegistry) {
    this.storage = storage;
    this.streamFactories = streamFactories;
  }

  /**
   * Create a stream instance by stream type and ID
   */
  public createStream(streamType: string, streamId: string): EvDbStream {
    const factory = this.streamFactories[streamType];

    if (!factory) {
      throw new Error(
        `No stream factory registered for stream type: ${streamType}. ` +
          `Available types: ${Object.keys(this.streamFactories).join(", ")}`,
      );
    }

    const stream = factory.create(
      streamId,
      this.storage.streamAdapter,
      this.storage.snapshotAdapter,
    );

    return stream;
  }

  /**
   * Get a stream instance from the event store by stream type and ID
   */
  public async getStream(streamType: string, streamId: string): Promise<EvDbStream> {
    const factory = this.streamFactories[streamType];

    if (!factory) {
      throw new Error(
        `No stream factory registered for stream type: ${streamType}. ` +
          `Available types: ${Object.keys(this.streamFactories).join(", ")}`,
      );
    }

    return factory.get(streamId, this.storage.streamAdapter, this.storage.snapshotAdapter);
  }

  /**
   * Check if a stream type is registered
   */
  public hasStreamType(streamType: string): boolean {
    return streamType in this.streamFactories;
  }

  /**
   * Get all registered stream types
   */
  public getStreamTypes(): string[] {
    return Object.keys(this.streamFactories);
  }

  public async close(): Promise<void> {
    await Promise.all([this.storage.snapshotAdapter.close(), this.storage.streamAdapter.close()]);
    return;
  }
}

/**
 * Type-safe store that knows about specific stream types
 */
export class EvDbEventStore<TStreamTypes extends Record<string, EvDbStreamFactory<any, any>>> {
  constructor(private readonly store: BaseStore) {
    // Create dynamic methods for each stream type
    this.createDynamicMethods();
  }

  /**
   * Create a stream with type-safe stream type parameter (fallback method)
   */
  public createStream<K extends keyof TStreamTypes & string>(
    streamType: K,
    streamId: string,
  ): EvDbStream {
    return this.store.createStream(streamType, streamId);
  }

  /**
   * Fetch a stream from the event store with type-safe stream type parameter (fallback method)
   */
  public getStream<K extends keyof TStreamTypes & string>(
    streamType: K,
    streamId: string,
  ): Promise<EvDbStream> {
    return this.store.getStream(streamType, streamId);
  }

  /**
   * Create dynamic methods for each registered stream factory
   */
  private createDynamicMethods(): void {
    const streamTypes = this.store.getStreamTypes();

    for (const streamType of streamTypes) {
      const methodName = `create${streamType}` as keyof this;

      // Create the dynamic method
      (this as any)[methodName] = (streamId: string) => {
        return this.store.createStream(streamType, streamId);
      };
    }
  }

  /**
   * Get the underlying store
   */
  public getStore(): BaseStore {
    return this.store;
  }
}

export type TypedStoreType<TStreamTypes extends Record<string, EvDbStreamFactory<any, any>>> =
  StreamCreatorMethods<TStreamTypes>;
