import type IEvDbView from "./IEvDbView.js";
import type EvDbEvent from "./EvDbEvent.js";
import type { EvDbStoredSnapshotData } from "./EvDbStoredSnapshotData.js";

/// View store contract.
export default interface IEvDbViewStore extends IEvDbView {
  /**
   * Indication whether the snapshot should be saved.
   * Useful for offset gaps, time since last save, or reacting to specific events.
   */
  shouldStoreSnapshot(
    offsetGapFromLastSave: number,
    durationSinceLastSaveMs: number, // TimeSpan → milliseconds
  ): boolean;

  /**
   * Apply event to the aggregate/view.
   */
  applyEvent(e: EvDbEvent): void;

  /**
   * Get the snapshot data.
   */
  getSnapshotData(): EvDbStoredSnapshotData;

  /**
   * Save snapshot data.
   */
  store(): Promise<void>;
}

export interface IEvDbViewStoreGeneric<TState> extends IEvDbViewStore {
  /**
   * Get the current state of the view.
   */
  state: TState;
}
