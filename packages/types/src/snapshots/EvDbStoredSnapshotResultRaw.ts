import type { EvDbStateRef } from "./EvDbStateRef.js";
import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase.js";

export class EvDbStoredSnapshotResultRaw extends EvDbStoredSnapshotResultBase {
  public readonly state: unknown;
  public readonly stateRef: EvDbStateRef;

  constructor(offset: number, storedAt: Date | undefined, state: unknown, stateRef: EvDbStateRef) {
    super(offset, storedAt);
    this.state = state;
    this.stateRef = stateRef;
  }

  static readonly Empty = new EvDbStoredSnapshotResultRaw(-1, undefined, undefined, {
    kind: "default",
  });
}
