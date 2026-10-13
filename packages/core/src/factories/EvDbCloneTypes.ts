import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";

/** Projection input. `switch (e.eventType)` narrows `payload`. */
export type EvDbCloneSourceEvent<TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: {
    readonly eventType: K;
    readonly payload: Readonly<TEventMap[K]>;
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

/** Maps a produced message, or returns `undefined` to drop it. */
export type EvDbCloneMessageProjection = (m: EvDbMessage) => EvDbMessage | undefined;

export interface EvDbCloneOptions<TEventMap extends Record<string, object>> {
  /** Last source offset to copy (inclusive). Default: the source head, read once at start. */
  offsetLimit?: number;
  /**
   * Source events read per page. Default 100. Writes are stored per page, and earlier when
   * pending events + messages reach 100 (DynamoDB transaction limit).
   */
  pageSize?: number;
  /** Maps a source event to a target event, or `undefined` to drop it. Default: copy as is. */
  projectEvent?: (
    e: EvDbCloneSourceEvent<TEventMap>,
  ) => EvDbCloneEventResult<TEventMap> | undefined;
  /**
   * Maps a produced message, or `undefined` to drop it.
   * Default: drop all messages, and the producer is not called.
   */
  projectMessage?: EvDbCloneMessageProjection;
}
