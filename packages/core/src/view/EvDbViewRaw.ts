import type IEvDbViewStore from "@eventualize/types/view/IEvDbViewStore";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { EvDbStoredSnapshotResult } from "@eventualize/types/snapshots/EvDbStoredSnapshotResult";
import type { EvDbStateRef } from "@eventualize/types/snapshots/EvDbStateRef";

export abstract class EvDbViewRaw implements IEvDbViewStore {
  private _memoryOffset: number;
  private _storeOffset: number;
  private _storedAt: Date;
  private _snapshotRequested = false;
  /** Where the current state is stored: a full row, or the default state. Valid while not dirty. */
  private _stateRef: EvDbStateRef;
  /** True when an applied event may have changed the state since the last full row. */
  private _dirty = false;
  /**
   * Settles when the last queued store() settles; undefined when none is in flight.
   * Serializes store() calls, so a slow write cannot finish after a later one and move stateRef back.
   */
  private _storeTail: Promise<void> | undefined;

  protected constructor(
    private readonly _storageAdapter: IEvDbStorageSnapshotAdapter,
    public readonly address: EvDbViewAddress,
    snapshot: EvDbStoredSnapshotResult<unknown>,
  ) {
    const storeOffset = snapshot.offset ?? 0;
    this._memoryOffset = storeOffset;
    this._storeOffset = storeOffset;
    this._stateRef = snapshot.stateRef;

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
  /** The full row (or default state) that the latest stored row resolves to. */
  get stateRef(): EvDbStateRef {
    return this._stateRef;
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
    // Only an explicit false means "unchanged"; undefined (e.g. a plain-JS override) counts as changed.
    if (this.onApplyEvent(e) !== false) {
      this._dirty = true;
    }
    this._memoryOffset = offset;
    if (evaluateSnapshotRules && !this._snapshotRequested && this.matchesSnapshotEvent(e)) {
      this._snapshotRequested = true;
    }
  }

  /**
   * Writes a pointer row when the state is unchanged since the last full row,
   * a full row when it changed and a snapshot is due, and nothing otherwise.
   * Calls run one at a time, in call order. With no store in flight, the call starts at once,
   * so it captures the offset at call time. A failed call rejects for its caller and does not
   * block the calls queued after it.
   */
  store(): Promise<void> {
    const previous = this._storeTail;
    const run = previous === undefined ? this.storeOnce() : previous.then(() => this.storeOnce());
    const tail: Promise<void> = run
      .catch(() => undefined)
      .then(() => {
        if (this._storeTail === tail) {
          this._storeTail = undefined;
        }
      });
    this._storeTail = tail;
    return run;
  }

  private async storeOnce(): Promise<void> {
    // No new events since the latest row.
    if (this._memoryOffset <= this._storeOffset) {
      return;
    }
    // Capture before the await: events applied while the write is in flight are not in this row.
    const snapshotOffset = this._memoryOffset;
    let snapshotData: EvDbStoredSnapshotData;
    let newRef: EvDbStateRef | undefined;
    if (!this._dirty) {
      snapshotData = EvDbStoredSnapshotData.fromAddress(
        this.address,
        snapshotOffset,
        this._storeOffset,
        { kind: "pointer", stateRef: this._stateRef },
      );
    } else {
      // A view with no snapshot has storeOffset -1, while a stream's first event is offset 1, so the base is 0.
      const eventsSinceLatestSnapshot = snapshotOffset - Math.max(this._storeOffset, 0);
      const msSinceLatestSnapshot = new Date().getTime() - this._storedAt.getTime();
      if (
        !this._snapshotRequested &&
        !this.shouldStoreSnapshot(eventsSinceLatestSnapshot, msSinceLatestSnapshot)
      ) {
        // Changed but not due. A pointer would claim an older state, so write nothing.
        return;
      }
      snapshotData = this.getSnapshotData();
      newRef = { kind: "row", offset: snapshotOffset };
    }
    await this._storageAdapter.storeSnapshotAsync(snapshotData);
    this._storeOffset = snapshotOffset;
    this._storedAt = new Date();
    if (newRef !== undefined) {
      this._stateRef = newRef;
    }
    if (this._memoryOffset === snapshotOffset) {
      this._snapshotRequested = false;
      if (newRef !== undefined) {
        this._dirty = false;
      }
    }
  }

  /**
   * Applies one event to the state.
   * @returns true when the state may have changed; false only when it provably did not.
   * Only an explicit `false` is read as "unchanged": any other value (such as `undefined`
   * from a plain-JS override) marks the view as changed.
   */
  protected abstract onApplyEvent(e: EvDbEvent): boolean;
}
