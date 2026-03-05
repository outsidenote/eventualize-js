import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type { EvDbView } from "../view/EvDbView";
import type { StreamWithEventMethods } from "./EvDbStreamFactory";

/**
 * General interface for an EvDbStreamFactory implementation.
 */
export interface IEvDbStreamFactory<
  TStreamType extends string,
  TViews extends Record<string, EvDbView<unknown>> = {},
> {
  create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    lastStreamOffset?: number,
  ): StreamWithEventMethods<TViews>;

  get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  ): Promise<StreamWithEventMethods<TViews>>;

  getStreamType(): TStreamType;
}
