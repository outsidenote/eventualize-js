import type IEvDbViewStore from "@eventualize/types/view/IEvDbViewStore";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbStoredSnapshotResult } from "@eventualize/types/snapshots/EvDbStoredSnapshotResult";

export abstract class EvDbViewRaw implements IEvDbViewStore {
  private _memoryOffset: number;
  private _storeOffset: number;
  private _storedAt: Date;

  protected constructor(
    private readonly _storageAdapter: IEvDbStorageSnapshotAdapter,
    public readonly address: EvDbViewAddress,
    snapshot: EvDbStoredSnapshotResult<any>,
  ) {
    const storeOffset = snapshot.offset ?? 0;
    this._memoryOffset = storeOffset;
    this._storeOffset = storeOffset;

    this._storedAt = snapshot.storedAt ?? new Date();
  }
  public abstract getSnapshotData(): EvDbStoredSnapshotData;

  get storedAt(): Date {
    return this._storedAt;
  }
  get storeOffset(): number {
    return this._storeOffset;
  }
  get memoryOffset(): number {
    return this._memoryOffset;
  }

  shouldStoreSnapshot(_offsetGapFromLastSave: number, _durationSinceLastSaveMs: number): boolean {
    return true;
  }
  applyEvent(e: EvDbEvent): void {
    const offset = e.streamCursor.offset;
    if (this.memoryOffset >= offset) {
      return;
    }
    this.onApplyEvent(e);
    this._memoryOffset = offset;
  }

  async store(): Promise<void> {
    const eventsSinceLatestSnapshot = this.memoryOffset - this.storeOffset;
    const secondsSinceLatestSnapshot = new Date().getTime() - this.storedAt.getTime();
    if (!this.shouldStoreSnapshot(eventsSinceLatestSnapshot, secondsSinceLatestSnapshot)) {
      return;
    }
    const snapshotData = this.getSnapshotData();
    await this._storageAdapter.storeSnapshotAsync(snapshotData);
    this._storeOffset = this._memoryOffset;
  }

  protected abstract onApplyEvent(e: EvDbEvent): void;
}
