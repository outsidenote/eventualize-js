import type { DeepReadonly } from "@eventualize/types/view/DeepReadonly";
import type { IEvDbViewStoreGeneric } from "@eventualize/types/view/IEvDbViewStoreGeneric";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbStoredSnapshotResult } from "@eventualize/types/snapshots/EvDbStoredSnapshotResult";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import { EvDbViewRaw } from "./EvDbViewRaw.js";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData.js";

export abstract class EvDbView<TState>
  extends EvDbViewRaw
  implements IEvDbViewStoreGeneric<TState>
{
  protected getDefaultState(): TState {
    return this.defaultState;
  }
  protected _state: TState = this.getDefaultState();
  get state(): DeepReadonly<TState> {
    // Cast only adds readonly; TS cannot prove a generic TState assignable to DeepReadonly<TState>.
    return this._state as DeepReadonly<TState>;
  }

  public constructor(
    address: EvDbViewAddress,
    storageAdapter: IEvDbStorageSnapshotAdapter,
    snapshot: EvDbStoredSnapshotResult<TState>,
    public readonly defaultState: TState,
  ) {
    super(storageAdapter, address, snapshot);
    // A default-state pointer row carries no state.
    if (snapshot.offset < 0 || snapshot.stateRef.kind === "default")
      this._state = this.getDefaultState();
    else this._state = snapshot.state;
  }

  getSnapshotData(): EvDbStoredSnapshotData {
    return EvDbStoredSnapshotData.fromAddress(this.address, this.memoryOffset, this.storeOffset, {
      kind: "full",
      state: this._state,
    });
  }

  public abstract handleOnApply(
    oldState: TState,
    event: IEvDbPayloadData,
    metadata: IEvDbEventMetadata,
  ): TState;

  /** Applies the event. A custom subclass cannot prove the state is unchanged, so this returns true. */
  protected onApplyEvent(e: EvDbEvent): boolean {
    this._state = this.handleOnApply(this._state, e.payload, e);
    return true;
  }
}
