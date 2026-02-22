export default class EvDbStoredSnapshotResultBase {
  public readonly offset: number;
  public readonly storedAt: Date | undefined;

  protected constructor(offset: number, storedAt: Date | undefined) {
    this.offset = offset;
    this.storedAt = storedAt;
  }

  static readonly None = new EvDbStoredSnapshotResultBase(0, undefined);
}
