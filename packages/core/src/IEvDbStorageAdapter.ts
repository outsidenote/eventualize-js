import type IEvDbStorageSnapshotAdapter from "@eventualize/types/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/IEvDbStorageStreamAdapter";

/**
 * Combined storage adapter interface
 */

export interface IEvDbStorageAdapter
  extends IEvDbStorageStreamAdapter,
    IEvDbStorageSnapshotAdapter {}
