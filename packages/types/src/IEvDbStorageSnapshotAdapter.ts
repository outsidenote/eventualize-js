import { EvDbStoredSnapshotResultRaw } from "./EvDbStoredSnapshotResult.js";
import { EvDbStoredSnapshotData } from "./EvDbStoredSnapshotData.js";
import EvDbViewAddress from "./EvDbViewAddress.js";

/**
 * Adapter for storing and retrieving view snapshots
 */
export default interface IEvDbStorageSnapshotAdapter {
    /**
     * Gets the latest stored view snapshot or an empty snapshot if none exists.
     * @param viewAddress The view address
     * @param signal Optional AbortSignal for cancellation
     * @returns The stored snapshot result
     */
    getSnapshotAsync(viewAddress: EvDbViewAddress): Promise<EvDbStoredSnapshotResultRaw>;

    /**
     * Stores the view's state as a snapshot.
     * @param snapshotData Snapshot data and metadata
     * @param signal Optional AbortSignal for cancellation
     */
    storeSnapshotAsync(snapshotData: EvDbStoredSnapshotData): Promise<void>;
}
