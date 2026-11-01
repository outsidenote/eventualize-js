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
  private _snapshotRequested = false;

  protected constructor(
    private readonly _storageAdapter: IEvDbStorageSnapshotAdapter,
    public readonly address: EvDbViewAddress,
    snapshot: EvDbStoredSnapshotResult<unknown>,
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
  /** True when an event rule asks to store a snapshot. Called once per applied event. */
  protected matchesSnapshotEvent(_e: EvDbEvent): boolean {
    return false;
  }
  /**
   * @param evaluateSnapshotRules - false skips event rules (used when catching up on stored events).
   */
  applyEvent(e: EvDbEvent, evaluateSnapshotRules = true): void {
    const offset = e.streamCursor.offset;
    if (this.memoryOffset >= offset) {
      return;
    }
    this.onApplyEvent(e);
    this._memoryOffset = offset;
    if (evaluateSnapshotRules && !this._snapshotRequested && this.matchesSnapshotEvent(e)) {
      this._snapshotRequested = true;
    }
  }

  async store(): Promise<void> {
    // A view with no snapshot has storeOffset -1, while a stream's first event is offset 1, so the base is 0.
    const eventsSinceLatestSnapshot = this.memoryOffset - Math.max(this.storeOffset, 0);
    const msSinceLatestSnapshot = new Date().getTime() - this.storedAt.getTime();
    if (
      !this._snapshotRequested &&
      !this.shouldStoreSnapshot(eventsSinceLatestSnapshot, msSinceLatestSnapshot)
    ) {
      return;
    }
    // Capture before the await: events applied while the write is in flight are not in this snapshot.
    const snapshotOffset = this._memoryOffset;
    const snapshotData = this.getSnapshotData();
    await this._storageAdapter.storeSnapshotAsync(snapshotData);
    this._storeOffset = snapshotOffset;
    this._storedAt = new Date();
    if (this._memoryOffset === snapshotOffset) {
      this._snapshotRequested = false;
    }
  }

  protected abstract onApplyEvent(e: EvDbEvent): void;
}
