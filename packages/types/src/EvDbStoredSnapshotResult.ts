import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase.js"

export class EvDbStoredSnapshotResultRaw extends EvDbStoredSnapshotResultBase {
    public readonly state: any;

    constructor(
        offset: number,
        storedAt: Date | undefined,
        state: any
    ) {
        super(offset, storedAt);
        this.state = state;
    }

    static readonly Empty = new EvDbStoredSnapshotResultRaw(
        -1,
        undefined,
        undefined
    );
}


export class EvDbStoredSnapshotResult<TState>
    extends EvDbStoredSnapshotResultBase
{
    public readonly state: TState;

    constructor(
        offset: number,
        storedAt: Date | undefined,
        state: TState
    ) {
        super(offset, storedAt);
        this.state = state;
    }

    /**
     * Returns an empty snapshot with offset -1.
     * 
     * Invariant: Empty position is represented as -1.
     * A snapshot at offset N means state AFTER applying event N.
     * So -1 means no events have been applied.
     */
    static getEmptyState<TState>(): EvDbStoredSnapshotResult<TState> {
        return new EvDbStoredSnapshotResult<TState>(
            -1,
            undefined,
            undefined as unknown as TState
        );
    }
}
