import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase.js";

export class EvDbStoredSnapshotResult<TState> extends EvDbStoredSnapshotResultBase {
  public readonly state: TState;

  constructor(offset: number, storedAt: Date | undefined, state: TState) {
    super(offset, storedAt);
    this.state = state;
  }

  static getEmptyState<TState>(): EvDbStoredSnapshotResult<TState> {
    return new EvDbStoredSnapshotResult<TState>(0, undefined, undefined as unknown as TState);
  }
}
