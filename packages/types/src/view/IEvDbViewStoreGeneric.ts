import type IEvDbViewStore from "./IEvDbViewStore.js";

export interface IEvDbViewStoreGeneric<TState> extends IEvDbViewStore {
  /**
   * Get the current state of the view.
   */
  state: TState;
}
