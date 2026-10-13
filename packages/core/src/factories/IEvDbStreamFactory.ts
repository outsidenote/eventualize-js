import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EvDbCloneOptions } from "./EvDbCloneTypes.js";

/**
 * General interface for an EvDbStreamFactory implementation.
 */

export interface IEvDbStreamFactory<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
> {
  create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    lastStreamOffset?: number,
  ): StreamWithEventMethods<TEventMap, TViews>;

  get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  ): Promise<StreamWithEventMethods<TEventMap, TViews>>;

  goToOffset(
    streamId: string,
    offset: number,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    pageSize?: number,
  ): Promise<IEvDbReadOnlyStream<TViews>>;

  clone(
    streamId: string,
    targetStreamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    options?: EvDbCloneOptions<TEventMap>,
  ): Promise<StreamWithEventMethods<TEventMap, TViews>>;

  getStreamType(): TStreamType;
}
