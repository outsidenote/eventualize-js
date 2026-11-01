import type EvDbStreamAddress from "../stream/EvDbStreamAddress.js";
import type EvDbViewAddress from "../view/EvDbViewAddress.js";
import type { EvDbSnapshotBody } from "./EvDbSnapshotBody.js";
import { EvDbStoredSnapshotResultRaw } from "./EvDbStoredSnapshotResultRaw.js";
import { EvDbStoredSnapshotDataBase } from "./EvDbStoredSnapshotDataBase.js";

export class EvDbStoredSnapshotData extends EvDbStoredSnapshotDataBase {
  readonly body: EvDbSnapshotBody;

  // Primary constructor equivalent
  constructor(
    id: string,
    streamType: string,
    streamId: string,
    viewName: string,
    offset: number,
    storeOffset: number,
    body: EvDbSnapshotBody,
  ) {
    super(id, streamType, streamId, viewName, offset, storeOffset);
    this.body = body;
  }

  // Secondary constructor (overload)
  static fromAddress(
    address: EvDbViewAddress,
    offset: number,
    storeOffset: number,
    body: EvDbSnapshotBody,
  ): EvDbStoredSnapshotData {
    return new EvDbStoredSnapshotData(
      crypto.randomUUID(),
      address.streamType,
      address.streamId,
      address.viewName,
      offset,
      storeOffset,
      body,
    );
  }

  // ------------------------------------------------------------------------------------
  // Equality helpers (TypeScript cannot overload ==, so explicit methods are used)
  // ------------------------------------------------------------------------------------

  private isEquals(obj: EvDbStoredSnapshotResultRaw): boolean {
    if (this.offset !== obj.offset) return false;

    // Compare any references (same as C# byte[] reference equality)
    if (this.body.kind !== "full" || this.body.state !== obj.state) return false;

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
    if (this.body.kind === "full") {
      return new EvDbStoredSnapshotResultRaw(this.offset, this.storedAt, this.body.state, {
        kind: "row",
        offset: this.offset,
      });
    }
    return new EvDbStoredSnapshotResultRaw(
      this.offset,
      this.storedAt,
      undefined,
      this.body.stateRef,
    );
  }
}
