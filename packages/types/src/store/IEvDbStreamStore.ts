import type EvDbStreamAddress from "../stream/EvDbStreamAddress.js";
import type StreamStoreAffected from "../stream/StreamStoreAffected.js";

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
  store(signal?: AbortSignal): Promise<StreamStoreAffected>;
}
