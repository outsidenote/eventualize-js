import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type { StreamWithEventMethods } from "./EvDbStreamFactory";

/**
 * General interface for an EvDbStreamFactory implementation.
 * TEventMap defaults to `Record<never, never>` — callers that don't need typed appendEvent
 * methods can omit it; the concrete builder result carries the full TEventMap.
 */
export interface IEvDbStreamFactory<
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
  TEventMap extends Record<string, object> = Record<never, never>,
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

  getStreamType(): TStreamType;
}
