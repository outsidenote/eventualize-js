import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";

/** Projection input: a stored source event. `switch (e.eventType)` narrows `payload`. */
export type EvDbCloneSourceEvent<TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: {
    readonly eventType: K;
    readonly payload: Readonly<TEventMap[K]>;
    /** The stored metadata of the source event (cursor, `capturedAt`, `capturedBy`, trace context). */
    readonly metadata: IEvDbEventMetadata;
  };
}[keyof TEventMap & string];

/** Projection output. The metadata fields are optional overrides. */
export type EvDbCloneEventResult<TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: {
    eventType: K;
    payload: TEventMap[K];
    /** Default: the source event's `capturedAt`. */
    capturedAt?: Date;
    /** Default: the source event's `capturedBy`. */
    capturedBy?: string;
  };
}[keyof TEventMap & string];

/**
 * Maps a message that the producer built for a cloned event, or returns `undefined`
 * to drop it. Kept messages are stamped with the cloned event's trace context.
 */
export type EvDbCloneMessageProjection = (m: EvDbMessage) => EvDbMessage | undefined;

/** Options for `factory.clone(...)`. All of them are optional. */
export interface EvDbCloneOptions<TEventMap extends Record<string, object>> {
  /**
   * Last source offset to copy (inclusive). A non-negative integer.
   * Default: the source head, read once at start. A limit past the head copies up to the head.
   */
  offsetLimit?: number;
  /**
   * Source events read per page. A positive integer. Default 100.
   *
   * Writes are stored per page. They are also stored earlier, before an event that would
   * push the pending events + messages past 100 (the DynamoDB transaction limit).
   */
  pageSize?: number;
  /**
   * Maps a source event to a target event, or `undefined` to drop it. Default: copy as is.
   * Views and the messages producer see the mapped event, not the source event.
   */
  projectEvent?: (
    e: EvDbCloneSourceEvent<TEventMap>,
  ) => EvDbCloneEventResult<TEventMap> | undefined;
  /**
   * Maps a produced message, or `undefined` to drop it.
   * Default: drop all messages, and the producer is not called.
   *
   * When this is set, view handlers run twice per cloned event. The first run is a preview
   * that gives the producer its view states. The second run is the real apply. So view
   * handlers must be pure: return a new state and do not mutate the old one.
   */
  projectMessage?: EvDbCloneMessageProjection;
}
