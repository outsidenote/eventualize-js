import type EvDbStreamAddress from "../stream/EvDbStreamAddress.js";
import type { EvDbStoredSnapshotResultRaw } from "./EvDbStoredSnapshotResultRaw.js";
import type EvDbViewAddress from "../view/EvDbViewAddress.js";
import { EvDbStoredSnapshotDataBase } from "./EvDbStoredSnapshotDataBase.js";

export class EvDbStoredSnapshotData extends EvDbStoredSnapshotDataBase {
  readonly state: any;

  // Primary constructor equivalent
  constructor(
    id: string,
    streamType: string,
    streamId: string,
    viewName: string,
    offset: number,
    storeOffset: number,
    state: any,
  ) {
    super(id, streamType, streamId, viewName, offset, storeOffset);
    this.state = state;
  }

  // Secondary constructor (overload)
  static fromAddress(
    address: EvDbViewAddress,
    offset: number,
    storeOffset: number,
    state: any,
  ): EvDbStoredSnapshotData {
    return new EvDbStoredSnapshotData(
      crypto.randomUUID(),
      address.streamType,
      address.streamId,
      address.viewName,
      offset,
      storeOffset,
      state,
    );
  }

  // ------------------------------------------------------------------------------------
  // Equality helpers (TypeScript cannot overload ==, so explicit methods are used)
  // ------------------------------------------------------------------------------------

  private isEquals(obj: EvDbStoredSnapshotResultRaw): boolean {
    if (this.offset !== obj.offset) return false;

    // Compare any references (same as C# byte[] reference equality)
    if (this.state !== obj.state) return false;

    return true;
  }

  equalsSnapshotResult(result: EvDbStoredSnapshotResultRaw): boolean {
    return this.isEquals(result);
  }

  equalsStreamAddress(address: EvDbStreamAddress): boolean {
    return this.streamType === address.streamType && this.streamId === address.streamId;
  }

  equalsViewAddress(address: EvDbViewAddress): boolean {
    return (
      this.streamType === address.streamType &&
      this.streamId === address.streamId &&
      this.viewName === address.viewName
    );
  }

  // ------------------------------------------------------------------------------------
  // Casting Overload (implicit operator in C# → explicit method in TS)
  // ------------------------------------------------------------------------------------
  toSnapshotResult(): EvDbStoredSnapshotResultRaw {
    return {
      offset: this.offset,
      storedAt: this.storedAt,
      state: this.state,
    } as unknown as EvDbStoredSnapshotResultRaw;
  }
}
