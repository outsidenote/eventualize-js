import EvDbStreamAddress from "./EvDbStreamAddress";
import StreamStoreAffected from "./StreamStoreAffected";



export default interface IEvDbStreamStore {
    /** The offset of the last event that was stored */
    readonly storedOffset: number;

    /** The stream's address */
    readonly streamAddress: EvDbStreamAddress;

    /** Number of events that were not stored yet */
    readonly countOfPendingEvents: number;

    /**
     * Saves pending events into the injected storage.
     * @param signal Optional AbortSignal to cancel the operation
     * @returns Count of added events
     */
    storeAsync(signal?: AbortSignal): Promise<StreamStoreAffected>;

    /** Release any resources */
    dispose(): void;
}
