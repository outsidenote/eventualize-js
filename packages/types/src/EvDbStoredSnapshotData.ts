import EvDbStreamAddress from "./EvDbStreamAddress.js";
import { EvDbStoredSnapshotResultRaw } from "./EvDbStoredSnapshotResult";
import EvDbViewAddress from "./EvDbViewAddress";



// Base class equivalent
export abstract class EvDbStoredSnapshotDataBase {
    constructor(
        public readonly id: string,
        public readonly streamType: string,
        public readonly streamId: string,
        public readonly viewName: string,
        public readonly offset: number,
        public readonly storeOffset: number,
        public readonly storedAt: Date = new Date()
    ) { }

    toStreamAddress(): EvDbStreamAddress {
        return new EvDbStreamAddress(this.streamType, this.streamId);
    }
}

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
        state: any
    ) {
        super(id, streamType, streamId, viewName, offset, storeOffset);
        this.state = state;
    }

    // Secondary constructor (overload)
    static fromAddress(
        address: EvDbViewAddress,
        offset: number,
        storeOffset: number,
        state: any
    ): EvDbStoredSnapshotData {
        return new EvDbStoredSnapshotData(
            crypto.randomUUID(),
            address.streamType,
            address.streamId,
            address.viewName,
            offset,
            storeOffset,
            state
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

    // TODO: is this needed?
    // equalsSnapshotCursor(cursor: EvDbSnapshotCursor): boolean {
    //     return this.isEquals(cursor);
    // }

    equalsStreamAddress(address: EvDbStreamAddress): boolean {
        return (
            this.streamType === address.streamType &&
            this.streamId === address.streamId
        );
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
            state: this.state
        };
    }
}
