import EvDbStoredSnapshotResultBase from "./EvDbStoredSnapshotResultBase"

export class EvDbStoredSnapshotResultRaw extends EvDbStoredSnapshotResultBase {
    public readonly state: Uint8Array;

    constructor(
        offset: number,
        storedAt: Date | null,
        state: any
    ) {
        super(offset, storedAt);
        this.state = state;
    }

    static readonly Empty = new EvDbStoredSnapshotResultRaw(
        0,
        null,
        new Uint8Array()
    );
}


export class EvDbStoredSnapshotResult<TState>
    extends EvDbStoredSnapshotResultBase
{
    public readonly state: TState;

    constructor(
        offset: number,
        storedAt: Date | null,
        state: TState
    ) {
        super(offset, storedAt);
        this.state = state;
    }

    static Empty<TState>(): EvDbStoredSnapshotResult<TState> {
        return new EvDbStoredSnapshotResult<TState>(
            0,
            null,
            undefined as unknown as TState
        );
    }
}
