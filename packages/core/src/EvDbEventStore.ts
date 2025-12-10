import EvDbStream from '@eventualize/types/EvDbStream';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";
import { EvDbStreamFactory } from './EvDbStreamFactory.js';

/**
 * Combined storage adapter interface
 */
export interface IEvDbStorageAdapter extends IEvDbStorageStreamAdapter, IEvDbStorageSnapshotAdapter { }

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
class BaseStore {
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
        `Available types: ${Object.keys(this.streamFactories).join(', ')}`
      );
    }

    return factory.create(
      streamId,
      this.storage.streamAdapter,
      this.storage.snapshotAdapter
    );
  }

  /**
   * Get a stream instance from the event store by stream type and ID
   */
  public async getStream(streamType: string, streamId: string): Promise<EvDbStream> {
    const factory = this.streamFactories[streamType];

    if (!factory) {
      throw new Error(
        `No stream factory registered for stream type: ${streamType}. ` +
        `Available types: ${Object.keys(this.streamFactories).join(', ')}`
      );
    }

    return factory.get(
      streamId,
      this.storage.streamAdapter,
      this.storage.snapshotAdapter
    );
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

  /**
   * Create a builder for configuring the store
   */
  public static builder(): BaseStoreBuilder {
    return new BaseStoreBuilder();
  }

  public async close(): Promise<void> {
    await Promise.all([this.storage.snapshotAdapter.close(), this.storage.streamAdapter.close()]);
    return;
  }
}

/**
 * Builder for creating Store instances
 */
class BaseStoreBuilder {
  private streamAdapter?: IEvDbStorageStreamAdapter;
  private snapshotAdapter?: IEvDbStorageSnapshotAdapter;
  private streamFactories: StreamFactoryRegistry = {};

  /**
   * Configure with separate stream and snapshot adapters
   */
  public withAdapters(
    streamAdapter: IEvDbStorageStreamAdapter,
    snapshotAdapter: IEvDbStorageSnapshotAdapter
  ): this {
    this.streamAdapter = streamAdapter;
    this.snapshotAdapter = snapshotAdapter;
    return this;
  }

  /**
   * Configure with a combined adapter that implements both interfaces
   */
  public withAdapter(adapter: IEvDbStorageAdapter): this {
    this.streamAdapter = adapter;
    this.snapshotAdapter = adapter;
    return this;
  }

  /**
   * Register a stream factory
   */
  public withStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string>(
    factory: EvDbStreamFactory<TEvents, TStreamType>
  ): this {
    const streamType = factory.getStreamType();
    if (this.streamFactories[streamType]) {
      throw new Error(`Stream factory for type '${streamType}' is already registered`);
    }
    this.streamFactories[streamType] = factory;
    return this;
  }

  /**
   * Register multiple stream factories at once
   */
  public withStreamFactories(
    factories: ReadonlyArray<EvDbStreamFactory<any, string>>
  ): this {
    factories.forEach(factory => {
      this.withStreamFactory(factory);
    });
    return this;
  }

  /**
   * Build the store instance
   */
  public build(): BaseStore {
    if (!this.streamAdapter || !this.snapshotAdapter) {
      throw new Error(
        'Storage adapters must be configured. Use withAdapter() or withAdapters()'
      );
    }

    if (Object.keys(this.streamFactories).length === 0) {
      console.warn('Store created with no stream factories registered');
    }

    return new BaseStore(
      {
        streamAdapter: this.streamAdapter,
        snapshotAdapter: this.snapshotAdapter
      },
      this.streamFactories
    );
  }
}

// ============================================================================
// TYPED STORE - Type-safe stream creation
// ============================================================================

/**
 * Helper type to create method signatures for each stream factory
 */
export type StreamCreatorMethods<TStreamTypes extends Record<string, EvDbStreamFactory<any, any>>> = {
  [K in keyof TStreamTypes as `create${K & string}`]: (streamId: string) => EvDbStream;
};

export type StreamMap = Record<string, any>;

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
    streamId: string
  ): EvDbStream {
    return this.store.createStream(streamType, streamId);
  }

  /**
   * Fetch a stream from the event store with type-safe stream type parameter (fallback method)
   */
  public getStream<K extends keyof TStreamTypes & string>(
    streamType: K,
    streamId: string
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

// Make TypedStore callable with dynamic methods
// export interface TypedStore<TStreamTypes extends Record<string, StreamFactory<any>>>
//     extends StreamCreatorMethods<TStreamTypes> { }

export type TypedStoreType<
  TStreamTypes extends Record<string, EvDbStreamFactory<any, any>>
> = StreamCreatorMethods<TStreamTypes>;

/**
 * Type-safe store builder
 */
export class EvDbEventStoreBuilder<
  TStreamTypes extends Record<string, EvDbStreamFactory<any, string>> = {}
> {
  private builder = BaseStore.builder();

  public withAdapters(
    streamAdapter: IEvDbStorageStreamAdapter,
    snapshotAdapter: IEvDbStorageSnapshotAdapter
  ): this {
    this.builder.withAdapters(streamAdapter, snapshotAdapter);
    return this;
  }

  public withAdapter(adapter: IEvDbStorageAdapter): this {
    this.builder.withAdapter(adapter);
    return this;
  }

  // Track stream type in generics
  public withStreamFactory<
    F extends EvDbStreamFactory<any, string>,
    K extends F extends EvDbStreamFactory<any, infer ST> ? ST : never
  >(
    factory: F
  ): EvDbEventStoreBuilder<TStreamTypes & Record<K, F>> {
    this.builder.withStreamFactory(factory);
    // return as the new type that tracks K
    return this as unknown as EvDbEventStoreBuilder<TStreamTypes & Record<K, F>>;
  }

  public build(): EvDbEventStore<TStreamTypes> & StreamCreatorMethods<TStreamTypes> {
    const store = new EvDbEventStore(this.builder.build());
    return store as EvDbEventStore<TStreamTypes> & StreamCreatorMethods<TStreamTypes>;
  }
}

export type EvDbEventStoreType<TStreams extends StreamMap = StreamMap> =
  EvDbEventStore<TStreams> & StreamCreatorMethods<TStreams>;
