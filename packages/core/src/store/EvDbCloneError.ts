/** The values that `EvDbCloneError` copies into its fields of the same name. */
export interface EvDbCloneErrorDetails {
  readonly sourceStreamId: string;
  readonly targetStreamId: string;
  readonly lastSourceOffset: number;
  readonly targetStoredOffset: number;
  readonly cause?: unknown;
}

/**
 * Thrown by `factory.clone(...)`.
 *
 * Either the target stream was not empty (nothing was written), or the copy
 * failed part-way. Progress is tracked per store (flush). A clone stores at the
 * end of each page, and earlier so that one store holds at most 100 events +
 * messages. Events stored before the failure stay in the target. Use
 * `lastSourceOffset` to decide how to continue (e.g. clone again into a new
 * target id).
 */
export default class EvDbCloneError extends Error {
  /** Id of the source stream that was being cloned. */
  readonly sourceStreamId: string;
  /** Id of the target stream that was being written. */
  readonly targetStreamId: string;
  /**
   * Last source offset that was fully handled: its events were stored, or dropped by
   * `projectEvent`. -1 when none was handled, or when the target was not empty.
   */
  readonly lastSourceOffset: number;
  /**
   * `storedOffset` of the target when the error happened. -1 when the target is still
   * empty. When the target was not empty, it is the last offset that was already there.
   */
  readonly targetStoredOffset: number;
  /**
   * The original error. `undefined` when the target was not empty (nothing failed).
   * `unknown` because anything can be thrown; the project targets ES2020, whose lib
   * has no `ErrorOptions`.
   */
  readonly cause: unknown;

  /**
   * @param message - The error message.
   * @param details - The stream ids, the progress of the clone, and the original error.
   */
  constructor(message: string, details: EvDbCloneErrorDetails) {
    super(message);
    this.name = "EvDbCloneError";
    this.sourceStreamId = details.sourceStreamId;
    this.targetStreamId = details.targetStreamId;
    this.lastSourceOffset = details.lastSourceOffset;
    this.targetStoredOffset = details.targetStoredOffset;
    this.cause = details.cause;
  }
}
