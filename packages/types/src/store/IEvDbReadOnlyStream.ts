import type EvDbEvent from "../events/EvDbEvent.js";
import type EvDbMessage from "../messages/EvDbMessage.js";

/**
 * A stream positioned on a stored event, for inspection only.
 *
 * Returned by `factory.goToOffset(...)`. It cannot append events or store.
 * Navigation is forward-only (see docs/adr/0001-replay-forward-only-navigation.md).
 */
export default interface IEvDbReadOnlyStream<TViews> {
  /** The event the stream is positioned on. `event.streamCursor` holds the address and offset. */
  readonly event: EvDbEvent;

  /** View states after `event` was applied. */
  readonly views: Readonly<TViews>;

  /**
   * Outbox messages that the current producer code derives from `event`.
   * Recomputed during replay — not read from the stored outbox.
   */
  readonly messages: ReadonlyArray<EvDbMessage>;

  /** `true` when no event exists after `event` (as of the last fetch). */
  readonly isHead: boolean;

  /**
   * Moves forward up to `steps` events (default 1). Stops early at the stream head.
   * At the head it re-checks storage, so events stored later are picked up.
   *
   * Mutates this instance and returns it (for chaining). It does not create a copy.
   * Not safe for concurrent calls: await each call before the next.
   * @param steps - How many events to move forward. A positive integer. Default 1.
   * @returns This stream, now positioned on the new event.
   * @throws RangeError when `steps` is not a positive integer.
   */
  forward(steps?: number): Promise<IEvDbReadOnlyStream<TViews>>;
}
