import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase.js";

export class EvDbStoredSnapshotResultRaw extends EvDbStoredSnapshotResultBase {
  public readonly state: unknown;

  constructor(offset: number, storedAt: Date | undefined, state: unknown) {
    super(offset, storedAt);
    this.state = state;
  }

  static readonly Empty = new EvDbStoredSnapshotResultRaw(-1, undefined, undefined);
}
