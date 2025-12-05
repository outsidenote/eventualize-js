import { EvDbStoredSnapshotResultRaw } from "./EvDbStoredSnapshotResult";
import { EvDbStoredSnapshotData } from "./EvDbStoredSnapshotData";
import EvDbViewAddress from "./EvDbViewAddress";

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
    getSnapshotAsync(
        viewAddress: EvDbViewAddress,
        signal?: AbortSignal
    ): Promise<EvDbStoredSnapshotResultRaw>;

    /**
     * Stores the view's state as a snapshot.
     * @param snapshotData Snapshot data and metadata
     * @param signal Optional AbortSignal for cancellation
     */
    storeSnapshotAsync(
        snapshotData: EvDbStoredSnapshotData,
        signal?: AbortSignal
    ): Promise<void>;
}
