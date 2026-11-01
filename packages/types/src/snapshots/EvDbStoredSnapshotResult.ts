import type { EvDbStateRef } from "./EvDbStateRef.js";
import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase.js";

export class EvDbStoredSnapshotResult<TState> extends EvDbStoredSnapshotResultBase {
  public readonly state: TState;
  public readonly stateRef: EvDbStateRef;

  constructor(offset: number, storedAt: Date | undefined, state: TState, stateRef: EvDbStateRef) {
    super(offset, storedAt);
    this.state = state;
    this.stateRef = stateRef;
  }

  static getEmptyState<TState>(): EvDbStoredSnapshotResult<TState> {
    return new EvDbStoredSnapshotResult<TState>(-1, undefined, undefined as unknown as TState, {
      kind: "default",
    });
  }
}
