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
 * failed part-way. Pages stored before the failure stay in the target; use
 * `lastSourceOffset` to decide how to continue (e.g. clone again into a new
 * target id).
 */
export default class EvDbCloneError extends Error {
  readonly sourceStreamId: string;
  readonly targetStreamId: string;
  /**
   * Last source offset whose page was fully handled: its events were stored, or
   * dropped by `projectEvent`. -1 when no page was handled.
   */
  readonly lastSourceOffset: number;
  /** `storedOffset` of the target when the error happened; -1 when nothing was stored. */
  readonly targetStoredOffset: number;
  /**
   * The original error. `unknown` because anything can be thrown; the project
   * targets ES2020, whose lib has no `ErrorOptions`.
   */
  readonly cause: unknown;

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
