import type { IEvDbViewStoreGeneric } from "@eventualize/types/view/IEvDbViewStoreGeneric";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbStoredSnapshotResult } from "@eventualize/types/snapshots/EvDbStoredSnapshotResult";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import { EvDbViewRaw } from "./EvDbViewRaw.js";

export abstract class EvDbView<TState>
  extends EvDbViewRaw
  implements IEvDbViewStoreGeneric<TState>
{
  protected getDefaultState(): TState {
    return this.defaultState;
  }
  protected _state: TState = this.getDefaultState();
  get state(): TState {
    return this._state;
  }

  public constructor(
    address: EvDbViewAddress,
    storageAdapter: IEvDbStorageSnapshotAdapter,
    snapshot: EvDbStoredSnapshotResult<TState>,
    public readonly defaultState: TState,
  ) {
    super(storageAdapter, address, snapshot);
    if (snapshot.offset === 0) this._state = this.getDefaultState();
    else this._state = snapshot.state;
  }

  getSnapshotData(): EvDbStoredSnapshotData {
    return EvDbStoredSnapshotData.fromAddress(
      this.address,
      this.memoryOffset,
      this.storeOffset,
      this._state,
    );
  }

  public abstract handleOnApply(
    oldState: TState,
    event: IEvDbEventPayload,
    metadata: IEvDbEventMetadata,
  ): TState;

  protected onApplyEvent(e: EvDbEvent): void {
    this._state = this.handleOnApply(this._state, e.payload, e);
  }
}
