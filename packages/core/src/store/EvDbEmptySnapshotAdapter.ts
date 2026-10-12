import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";

/**
 * Snapshot adapter with no snapshots. Used by replay when the caller passes no
 * snapshot adapter, so views still exist and fold from their default state.
 * Replay never stores, so storing through this adapter is an error.
 */
export default class EvDbEmptySnapshotAdapter implements IEvDbStorageSnapshotAdapter {
  async getSnapshotAsync(): Promise<EvDbStoredSnapshotResultRaw> {
    return EvDbStoredSnapshotResultRaw.Empty;
  }

  async storeSnapshotAsync(): Promise<void> {
    throw new Error("EvDbEmptySnapshotAdapter cannot store snapshots (read-only replay)");
  }

  async close(): Promise<void> {}
}
