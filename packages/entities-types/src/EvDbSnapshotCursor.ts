import EvDbStreamAddress from "./EvDbStreamAddress.js";
import EvDbViewAddress from "./EvDbViewAddress.js";


export default class EvDbSnapshotCursor {
    readonly streamType: string;
    readonly streamId: string;
    readonly viewName: string;
    readonly offset: number;

    constructor(
        streamType: string,
        streamId: string,
        viewName: string,
        offset: number = 0
    ) {
        this.streamType = streamType;
        this.streamId = streamId;
        this.viewName = viewName;
        this.offset = offset;

        Object.freeze(this); // mimic C# record struct immutability
    }

    // Equivalent to: public static readonly EvDbSnapshotCursor Empty
    static readonly Empty = new EvDbSnapshotCursor("N/A", "N/A", "N/A", 0);

    // Alternative constructor: (EvDbStreamAddress, viewName, offset)
    static fromStreamAddress(
        address: EvDbStreamAddress,
        viewName: string,
        offset: number = 0
    ): EvDbSnapshotCursor {
        return new EvDbSnapshotCursor(address.streamType, address.streamId, viewName, offset);
    }

    // --------------------------
    // Equality helpers
    // --------------------------

    private equalsViewAddress(address: EvDbViewAddress): boolean {
        return (
            this.streamType === address.streamType &&
            this.streamId === address.streamId &&
            this.viewName === address.viewName
        );
    }

    private equalsStreamAddress(address: EvDbStreamAddress): boolean {
        return (
            this.streamType === address.streamType &&
            this.streamId === address.streamId
        );
    }

    // C# operator == equivalents
    equalsAddress(address: any): boolean {
        if ("viewName" in address) return this.equalsViewAddress(address);
        return this.equalsStreamAddress(address);
    }

    // --------------------------
    // "Implicit cast" equivalents
    // --------------------------

    toStreamAddress(): { streamType: string; streamId: string } {
        return new EvDbStreamAddress(this.streamType, this.streamId);
    }

    toViewAddress(): { streamType: string; streamId: string; viewName: string } {
        return new EvDbViewAddress(
            new EvDbStreamAddress(this.streamType, this.streamId),
            this.viewName
        );
    }

    // --------------------------
    // toString & filter string
    // --------------------------

    toString(): string {
        // Format: Type:Id:View:000_000_000_000
        const formattedOffset = this.offset.toString().padStart(12, "0");
        return `${this.streamType}:${this.streamId}:${this.viewName}:${formattedOffset}`;
    }

    toFilterString(): string {
        // Format without offset: Type:Id:View:
        return `${this.streamType}:${this.streamId}:${this.viewName}:`;
    }
}
