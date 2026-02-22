import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";

/**
 * Combined storage adapter interface
 */

export interface IEvDbStorageAdapter
  extends IEvDbStorageStreamAdapter,
    IEvDbStorageSnapshotAdapter {}
