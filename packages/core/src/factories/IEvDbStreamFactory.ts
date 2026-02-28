import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type { EvDbView } from "../view/EvDbView";
import { StreamWithEventMethods } from "./EvDbStreamFactory";

/**
 * General interface for an EvDbStreamFactory implementation.
 */

export interface IEvDbStreamFactory<
  TEvents extends IEvDbEventPayload,
  TStreamType extends string,
  TViews extends Record<string, EvDbView<any>> = {}
> {
  create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    lastStreamOffset?: number
  ): StreamWithEventMethods<TEvents, TViews>;

  get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter
  ): Promise<StreamWithEventMethods<TEvents, TViews>>;

  getStreamType(): TStreamType;
}
