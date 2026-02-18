import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';

/**
 * Combined storage adapter interface
 */

export interface IEvDbStorageAdapter extends IEvDbStorageStreamAdapter, IEvDbStorageSnapshotAdapter { }
