import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase"

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
        0,
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

    static getEmptyState<TState>(): EvDbStoredSnapshotResult<TState> {
        return new EvDbStoredSnapshotResult<TState>(
            0,
            undefined,
            undefined as unknown as TState
        );
    }
}
