import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";

/** One adapter that stores both events and view snapshots (Prisma adapter, in-memory test adapter). */
export type PlaygroundStorage = IEvDbStorageStreamAdapter & IEvDbStorageSnapshotAdapter;
