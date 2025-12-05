export default class EvDbStoredSnapshotResultBase {
    public readonly offset: number;
    public readonly storedAt: Date | null;

    protected constructor(offset: number, storedAt: Date | null) {
        this.offset = offset;
        this.storedAt = storedAt;

        // Optional: mimic record immutability
        Object.freeze(this);
    }

    static readonly None = new EvDbStoredSnapshotResultBase(0, null);
}
