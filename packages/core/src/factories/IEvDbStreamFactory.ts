import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EvDbCloneOptions } from "./EvDbCloneTypes.js";

/**
 * General interface for an EvDbStreamFactory implementation.
 */

export interface IEvDbStreamFactory<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
> {
  create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    lastStreamOffset?: number,
  ): StreamWithEventMethods<TEventMap, TViews>;

  get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  ): Promise<StreamWithEventMethods<TEventMap, TViews>>;

  /**
   * Opens a read-only stream positioned on the event at `offset`.
   *
   * Views start from their latest snapshot at or before `offset` (or from the
   * default state) and fold the stored events up to `offset`. Nothing is
   * stored. Navigation is forward-only: use `forward()` to move on, or call
   * `goToOffset` again to go back.
   *
   * @param streamId - The id of the stream to inspect.
   * @param offset - The offset of the event to position on. A non-negative integer.
   * @param streamStorageAdapter - The adapter that events are read from.
   * @param snapshotStorageAdapter - Optional. Snapshots are only read, never written.
   *   Without it, views fold from their default state.
   * @param pageSize - Events read per storage query. A positive integer. Default 100.
   * @returns A read-only stream positioned on the event at `offset`.
   * @throws RangeError when `offset` or `pageSize` is invalid, or when the
   *   stream has no event at `offset`.
   *
   * @example
   * ```ts
   * const stream = await PointsStreamFactory.goToOffset(
   *   "points-1", // stream id
   *   15, // offset to position on
   *   storageAdapter,
   *   snapshotAdapter, // optional
   * );
   *
   * stream.event; // the stored event at offset 15
   * stream.views; // view states after that event
   * stream.messages; // messages recomputed for that event (not the stored outbox)
   *
   * while (!stream.isHead) {
   *   await stream.forward(); // moves the same instance one event on
   * }
   * ```
   */
  goToOffset(
    streamId: string,
    offset: number,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    pageSize?: number,
  ): Promise<IEvDbReadOnlyStream<TViews>>;

  /**
   * Copies a stream, up to `options.offsetLimit` (inclusive), into a new,
   * empty stream of the same type.
   *
   * Events are read in pages of `options.pageSize`. Writes are stored at the
   * end of each page, and earlier, before an event that would push the pending
   * events + messages past 100 (the DynamoDB transaction limit). An event and
   * its messages are always stored together.
   *
   * `projectEvent` can change or drop events (default: copy as is, keeping
   * `capturedAt` and `capturedBy`). `projectMessage` can change or drop produced
   * outbox messages (default: drop all, and the producer is not called). When
   * `projectMessage` is set, view handlers run twice per cloned event: a preview
   * that gives the producer its view states, then the real apply. So view
   * handlers must be pure: return a new state, do not mutate.
   *
   * Target offsets start at 0 and have no gaps, so they can differ from the
   * source offsets when events are dropped.
   *
   * Progress is per store. If the copy fails part-way, the events stored before
   * the failure stay in the target, and `EvDbCloneError.lastSourceOffset` is the
   * last source offset fully handled (its events stored, or dropped by
   * `projectEvent`; -1 when none).
   *
   * @param streamId - The id of the source stream.
   * @param targetStreamId - The id of the new stream. It must be empty and differ from `streamId`.
   * @param streamStorageAdapter - The adapter that events are read from and written to.
   * @param snapshotStorageAdapter - Optional. When given, the target has the configured views,
   *   and their snapshots are saved on each store. Without it, the target has no views and
   *   the messages producer sees no view states.
   * @param options - See `EvDbCloneOptions`: `offsetLimit`, `pageSize`, `projectEvent`,
   *   `projectMessage`.
   * @returns The target as a normal writable stream at its head.
   * @throws RangeError when `streamId` equals `targetStreamId`, or when `offsetLimit`
   *   or `pageSize` is invalid.
   * @throws EvDbCloneError when the target is not empty, or when reading, projecting or
   *   storing fails part-way (events stored before the failure stay in the target).
   *
   * @example
   * ```ts
   * const copy = await PointsStreamFactory.clone(
   *   "points-1", // source stream id
   *   "points-1-copy", // target stream id (must be empty)
   *   storageAdapter,
   *   snapshotAdapter,
   *   {
   *     offsetLimit: 15, // optional, inclusive; default: the source head
   *     projectEvent: (e) => (e.eventType === "PointsMultiplied" ? undefined : e), // drop events
   *     projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`), // optional; default: no messages
   *   },
   * );
   *
   * copy.views; // view states after the copied events
   * await copy.appendEventPointsAdded({ points: 5 }); // the copy is a normal writable stream
   * ```
   */
  clone(
    streamId: string,
    targetStreamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    options?: EvDbCloneOptions<TEventMap>,
  ): Promise<StreamWithEventMethods<TEventMap, TViews>>;

  getStreamType(): TStreamType;
}
