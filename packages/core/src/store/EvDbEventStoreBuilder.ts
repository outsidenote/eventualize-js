import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type { EvDbStreamFactory } from "../factories/EvDbStreamFactory.js";
import type { IEvDbStorageAdapter } from "../adapters/IEvDbStorageAdapter.js";
import { BaseStore, EvDbEventStore } from "./EvDbEventStore.js";
import type { StreamCreatorMethods } from "./EvDbEventStoreTypes.js";

/**
 * Registry of stream factories by stream type
 */
interface StreamFactoryRegistry {
  [streamType: string]: EvDbStreamFactory<any, any>;
}

/**
 * Type-safe store builder
 */
export class EvDbEventStoreBuilder<
  TStreamTypes extends Record<string, EvDbStreamFactory<any, string>> = {},
> {
  private streamAdapter?: IEvDbStorageStreamAdapter;
  private snapshotAdapter?: IEvDbStorageSnapshotAdapter;
  private streamFactories: StreamFactoryRegistry = {};

  public withAdapters(
    streamAdapter: IEvDbStorageStreamAdapter,
    snapshotAdapter: IEvDbStorageSnapshotAdapter,
  ): this {
    this.streamAdapter = streamAdapter;
    this.snapshotAdapter = snapshotAdapter;
    return this;
  }

  public withAdapter(adapter: IEvDbStorageAdapter): this {
    this.streamAdapter = adapter;
    this.snapshotAdapter = adapter;
    return this;
  }

  // Track stream type in generics
  public withStreamFactory<
    F extends EvDbStreamFactory<any, string>,
    K extends F extends EvDbStreamFactory<any, infer ST> ? ST : never,
  >(factory: F): EvDbEventStoreBuilder<TStreamTypes & Record<K, F>> {
    const streamType = factory.getStreamType();
    if (this.streamFactories[streamType]) {
      throw new Error(`Stream factory for type '${streamType}' is already registered`);
    }
    this.streamFactories[streamType] = factory;
    // return as the new type that tracks K
    return this as unknown as EvDbEventStoreBuilder<TStreamTypes & Record<K, F>>;
  }

  public build(): EvDbEventStore<TStreamTypes> & StreamCreatorMethods<TStreamTypes> {
    if (!this.streamAdapter || !this.snapshotAdapter) {
      throw new Error("Storage adapters must be configured. Use withAdapter() or withAdapters()");
    }

    if (Object.keys(this.streamFactories).length === 0) {
      console.warn("Store created with no stream factories registered");
    }

    const baseStore = new BaseStore(
      {
        streamAdapter: this.streamAdapter,
        snapshotAdapter: this.snapshotAdapter,
      },
      this.streamFactories,
    );
    const store = new EvDbEventStore(baseStore);
    return store as EvDbEventStore<TStreamTypes> & StreamCreatorMethods<TStreamTypes>;
  }
}
