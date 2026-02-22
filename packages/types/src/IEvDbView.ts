import type EvDbViewAddress from "./EvDbViewAddress.js";

export default interface IEvDbView {
  /**
   * Gets the offset of the last folded event (in-memory).
   */
  readonly memoryOffset: number;

  /**
   * Gets the name of the view.
   */
  readonly address: EvDbViewAddress;

  /**
   * The offset of the last snapshot that was stored.
   */
  readonly storeOffset: number;
}
