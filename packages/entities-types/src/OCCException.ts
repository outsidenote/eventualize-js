import EvDbSnapshotCursor from "./EvDbSnapshotCursor.js";

/**
 * Optimistic Concurrency Collisions Exception
 */
export default class OCCException extends Error {
    constructor();
    /** @deprecated Shouldn't be used directly; used by the serialization */
    constructor(message: string);
    constructor(cursor: EvDbSnapshotCursor);
    constructor(cursor: EvDbSnapshotCursor, innerException: Error);
    constructor(arg1?: string | EvDbSnapshotCursor, arg2?: Error) {
        if (typeof arg1 === "string") {
            // Obsolete constructor
            super(arg1);
        } else if (arg1 instanceof EvDbSnapshotCursor) {
            super(arg1.toString());
            if (arg2) {
                // Attach inner exception as a property (TypeScript does not have built-in inner exceptions)
                (this as any).innerException = arg2;
            }
        } else {
            super(); // parameterless constructor
        }

        // Set the prototype explicitly (needed for extending built-in Error in TypeScript)
        Object.setPrototypeOf(this, OCCException.prototype);

        this.name = "OCCException";
    }

    /** Optional inner exception for chaining */
    public innerException?: Error;
}
