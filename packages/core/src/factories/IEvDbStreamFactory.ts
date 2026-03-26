import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";

/**
 * General interface for an EvDbStreamFactory implementation.
 */

export interface IEvDbStreamFactory<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
  TViews extends Record<string, unknown> = {}
> {
  create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    lastStreamOffset?: number
  ): StreamWithEventMethods<TEventMap, TViews>;

  get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter
  ): Promise<StreamWithEventMethods<TEventMap, TViews>>;

  getStreamType(): TStreamType;
}
