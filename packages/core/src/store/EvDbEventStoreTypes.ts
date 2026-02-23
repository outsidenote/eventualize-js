import type EvDbStream from "./EvDbStream.js";
import type { EvDbStreamFactory } from "../factories/EvDbStreamFactory.js";
import type { EvDbEventStore } from "./EvDbEventStore.js";

/**
 * Helper type to create method signatures for each stream factory
 */
export type StreamCreatorMethods<TStreamTypes extends Record<string, EvDbStreamFactory<any, any>>> =
  {
    [K in keyof TStreamTypes as `create${K & string}`]: (streamId: string) => EvDbStream;
  };

export type StreamMap = Record<string, any>;

export type EvDbEventStoreType<TStreams extends StreamMap = StreamMap> = EvDbEventStore<TStreams> &
  StreamCreatorMethods<TStreams>;
