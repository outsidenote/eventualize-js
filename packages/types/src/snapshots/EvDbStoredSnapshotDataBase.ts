import EvDbStreamAddress from "../stream/EvDbStreamAddress.js";

// Base class equivalent
export abstract class EvDbStoredSnapshotDataBase {
  constructor(
    public readonly id: string,
    public readonly streamType: string,
    public readonly streamId: string,
    public readonly viewName: string,
    public readonly offset: number,
    public readonly storeOffset: number,
    public readonly storedAt: Date = new Date(),
  ) {}

  toStreamAddress(): EvDbStreamAddress {
    return new EvDbStreamAddress(this.streamType, this.streamId);
  }
}
