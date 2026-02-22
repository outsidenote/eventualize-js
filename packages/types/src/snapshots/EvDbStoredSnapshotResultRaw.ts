import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase.js";

export class EvDbStoredSnapshotResultRaw extends EvDbStoredSnapshotResultBase {
  public readonly state: any;

  constructor(offset: number, storedAt: Date | undefined, state: any) {
    super(offset, storedAt);
    this.state = state;
  }

  static readonly Empty = new EvDbStoredSnapshotResultRaw(0, undefined, undefined);
}
