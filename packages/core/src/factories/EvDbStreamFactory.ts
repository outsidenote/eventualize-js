import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import type StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";

import EvDbStream from "../store/EvDbStream.js";
import { EvDbReadOnlyStream } from "../store/EvDbReadOnlyStream.js";
import type { IEvDbReplayTarget } from "../store/EvDbReadOnlyStream.js";
import EvDbEmptySnapshotAdapter from "../store/EvDbEmptySnapshotAdapter.js";
import { fetchPage } from "../store/fetchPage.js";
import EvDbCloneError from "../store/EvDbCloneError.js";
import type { EvDbView } from "../view/EvDbView.js";
import type { EvDbStreamFactoryConfig } from "./EvDbStreamFactoryTypes.js";
import type { IEvDbStreamFactory } from "./IEvDbStreamFactory.js";
import type {
  EvDbCloneEventResult,
  EvDbCloneMessageProjection,
  EvDbCloneOptions,
  EvDbCloneSourceEvent,
} from "./EvDbCloneTypes.js";
import { getCoreTracer } from "../otel/tracers.js";
import { withSpan } from "../otel/withSpan.js";

const EMPTY_SNAPSHOT_ADAPTER = new EvDbEmptySnapshotAdapter();

/** Max events + messages per clone store() — DynamoDB TransactWriteItems accepts at most 100 items. */
const MAX_ITEMS_PER_STORE = 100;

type StreamCtorArgs = [
  streamType: string,
  views: EvDbView<unknown>[],
  streamStorageAdapter: IEvDbStorageStreamAdapter,
  streamId: string,
  lastStreamOffset: number,
];

/** A cloned event and its kept messages, built but not yet added to the target. */
interface StagedClonedEvent {
  readonly event: EvDbEvent;
  readonly messages: ReadonlyArray<EvDbMessage>;
}

/** The internal clone stream, as seen by `clone()`. */
interface IEvDbCloneTarget {
  readonly storedOffset: number;
  readonly countOfPendingEvents: number;
  /** Events + messages waiting for the next store(). */
  readonly pendingItemCount: number;
  stageCloned(
    eventType: string,
    payload: IEvDbPayloadData,
    capturedAt: Date,
    capturedBy: string,
    projectMessage: EvDbCloneMessageProjection | undefined,
  ): StagedClonedEvent;
  commitCloned(staged: StagedClonedEvent): void;
  store(): Promise<StreamStoreAffected>;
}

/**
 * Storage boundary: stored events are untyped (`eventType: string`,
 * `payload: IEvDbPayloadData`). A factory only stores event types from its
 * TEventMap, so presenting them as the typed union is sound for streams
 * written through this factory — the same boundary cast as
 * `StreamFactoryBuilder.withMessages`.
 */
function toCloneSourceEvent<TEventMap extends Record<string, object>>(
  e: EvDbEvent,
): EvDbCloneSourceEvent<TEventMap> {
  return {
    eventType: e.eventType,
    payload: e.payload,
    metadata: e,
  } as unknown as EvDbCloneSourceEvent<TEventMap>;
}

/** Storage boundary: a typed payload object is stored as untyped payload data. */
function toPayloadData<TEventMap extends Record<string, object>>(
  r: EvDbCloneEventResult<TEventMap>,
): IEvDbPayloadData {
  return r.payload as IEvDbPayloadData;
}

/** The fields of an event as it is written to the clone target. */
interface ClonedEventFields {
  readonly eventType: string;
  readonly payload: IEvDbPayloadData;
  readonly capturedAt: Date;
  readonly capturedBy: string;
}

/** Runs `projectEvent`; the metadata overrides default to the source event's values. */
function projectClonedEvent<TEventMap extends Record<string, object>>(
  e: EvDbEvent,
  projectEvent: NonNullable<EvDbCloneOptions<TEventMap>["projectEvent"]>,
): ClonedEventFields | undefined {
  const projected = projectEvent(toCloneSourceEvent<TEventMap>(e));
  if (projected === undefined) return undefined;
  return {
    eventType: projected.eventType,
    payload: toPayloadData<TEventMap>(projected),
    capturedAt: projected.capturedAt ?? e.capturedAt,
    capturedBy: projected.capturedBy ?? e.capturedBy,
  };
}

/**
 * Type helper to extract event methods from TEventMap
 */
type EventMethods<TEventMap extends Record<string, object>> = {
  [K in string & keyof TEventMap as `appendEvent${K}`]: (event: TEventMap[K]) => Promise<void>;
};

/**
 * Type helper to create view accessors map
 */
type ViewAccessors<TViews extends Record<string, unknown>> = {
  readonly views: Readonly<TViews>;
};

/**
 * Combined stream type with event methods and view accessors
 */
export type StreamWithEventMethods<
  TEventMap extends Record<string, object>,
  TViews extends Record<string, unknown> = {},
> = EvDbStream & EventMethods<TEventMap> & ViewAccessors<TViews>;

/**
 * Stream Factory - creates stream instances with configured views and dynamic event methods
 */
export class EvDbStreamFactory<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
> implements IEvDbStreamFactory<TEventMap, TStreamType, TViews>
{
  private DynamicStreamClass: new (...args: StreamCtorArgs) => StreamWithEventMethods<
    TEventMap,
    TViews
  >;
  private ReplayStreamClass: new (...args: StreamCtorArgs) => IEvDbReplayTarget<TViews>;
  private CloneStreamClass: new (...args: StreamCtorArgs) => IEvDbCloneTarget;

  constructor(private readonly config: EvDbStreamFactoryConfig<TEventMap, TStreamType>) {
    const classes = this.createDynamicStreamClasses();
    this.DynamicStreamClass = classes.stream;
    this.ReplayStreamClass = classes.replay;
    this.CloneStreamClass = classes.clone;
  }

  /**
   * Creates the dynamic stream class (event-specific methods and view accessors),
   * the internal replay stream class used by goToOffset, and the internal clone
   * stream class used by clone
   */
  private createDynamicStreamClasses() {
    const eventTypes = this.config.eventTypes;
    const viewNames = this.config.viewNames;

    const messagesProducer: EVDbMessagesProducer = (
      event: EvDbEvent,
      viewsState: Readonly<Record<string, unknown>>,
    ) => {
      const eventType = eventTypes.find((e) => e.eventName === event.eventType);
      if (!eventType || !eventType.eventMessagesProducer) return [];
      return eventType.eventMessagesProducer(event, viewsState);
    };

    class DynamicStream extends EvDbStream {
      private readonly _viewMap: Record<string, EvDbView<unknown>> = {};
      public readonly views: Record<string, unknown>;

      constructor(
        streamType: string,
        views: EvDbView<unknown>[],
        streamStorageAdapter: IEvDbStorageStreamAdapter,
        streamId: string,
        lastStreamOffset: number,
      ) {
        super(
          streamType,
          views,
          streamStorageAdapter,
          streamId,
          lastStreamOffset,
          messagesProducer,
        );

        views.forEach((view, index) => {
          const viewName = viewNames[index];
          if (viewName) {
            this._viewMap[viewName] = view;
          }
        });

        this.views = new Proxy(this._viewMap, {
          get(target, prop: string) {
            return target[prop]?.state;
          },
        }) as Record<string, unknown>;
      }
    }

    // Add dynamic methods for each event type
    eventTypes.forEach(({ eventName }) => {
      const methodName = `appendEvent${eventName}`;
      (DynamicStream.prototype as unknown as Record<string, unknown>)[methodName] = async function (
        this: EvDbStream,
        event: Record<string, unknown>,
        capturedBy?: string | null,
      ) {
        return this.appendEvent(eventName, event, capturedBy);
      };
    });

    /** Internal stream used by goToOffset: exposes applyEvent for stored events. */
    class ReplayStream extends DynamicStream {
      replayEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
        return this.applyEvent(e);
      }
    }

    /** Internal stream used by clone: appends copied events with given metadata. */
    class CloneStream extends DynamicStream {
      get pendingItemCount(): number {
        return this._pendingEvents.length + this._pendingMessages.length;
      }

      /**
       * Builds a cloned event and its kept messages without changing the views or the
       * pending buffers, so the caller can store the pending batch first when this event
       * would not fit. The producer sees the view states as they will be once the event is
       * applied; they are computed with the views' handlers, which must be pure.
       */
      stageCloned(
        eventType: string,
        payload: IEvDbPayloadData,
        capturedAt: Date,
        capturedBy: string,
        projectMessage: EvDbCloneMessageProjection | undefined,
      ): StagedClonedEvent {
        const event = this.buildEvent(eventType, payload, capturedAt, capturedBy);
        if (!projectMessage) return { event, messages: [] };
        const statesAfterEvent = Object.fromEntries(
          Object.entries(this._views).map(([name, view]) => [
            name,
            view.handleOnApply(view.state, event.payload, event),
          ]),
        );
        // Stamp after the projection, so a message the projection built from scratch
        // still carries the event's trace context.
        const messages = this.produceMessages(event, statesAfterEvent).flatMap((m) => {
          const projected = projectMessage(m);
          if (projected === undefined) return [];
          return [
            event.traceparent
              ? projected.withTraceparent(event.traceparent, event.tracestate)
              : projected,
          ];
        });
        return { event, messages };
      }

      commitCloned({ event, messages }: StagedClonedEvent): void {
        this._pendingEvents = [...this._pendingEvents, event];
        this.applyToViews(event);
        this._pendingMessages = [...this._pendingMessages, ...messages];
      }
    }

    return {
      stream: DynamicStream as unknown as typeof this.DynamicStreamClass,
      replay: ReplayStream as unknown as typeof this.ReplayStreamClass,
      clone: CloneStream as unknown as typeof this.CloneStreamClass,
    };
  }

  /**
   * Creates a stream instance with all configured views and dynamic event methods
   */
  public create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
    lastStreamOffset: number = 0,
  ): StreamWithEventMethods<TEventMap, TViews> {
    const views = snapshotStorageAdapter
      ? this.createViews(streamId, snapshotStorageAdapter)
      : ([] as EvDbView<unknown>[]);

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      lastStreamOffset,
    );
  }

  private createViews(
    streamId: string,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
  ): Array<EvDbView<unknown>> {
    const views = this.config.viewFactories.map((factory) =>
      factory.create(streamId, snapshotStorageAdapter),
    );
    return views;
  }

  private getViews(
    streamId: string,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
  ): Promise<EvDbView<unknown>>[] {
    const getViewPromises = this.config.viewFactories.map((viewFactory) =>
      viewFactory.get(streamId, snapshotStorageAdapter),
    );
    return getViewPromises;
  }

  /**
   * Fetches from storage a stream instance with all configured views and dynamic event methods
   */
  public async get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
  ): Promise<StreamWithEventMethods<TEventMap, TViews>> {
    return withSpan(getCoreTracer(), "eventualize.stream.get", async (span) => {
      span.setAttribute("eventualize.stream.id", streamId);
      span.setAttribute("eventualize.stream.type", this.config.streamType);

      const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);

      const views = snapshotStorageAdapter
        ? await Promise.all(this.getViews(streamId, snapshotStorageAdapter))
        : [];

      if (!views.length) {
        const lastStreamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress);
        return this.create(
          streamId,
          streamStorageAdapter,
          snapshotStorageAdapter,
          lastStreamOffset,
        );
      }

      const lowestViewOffset = views.reduce(
        (lowestOffset: number, currentView: EvDbView<unknown>) =>
          Math.min(lowestOffset, currentView.storeOffset),
        Number.MAX_VALUE,
      );

      let streamOffset: number;
      if (snapshotStorageAdapter) {
        // lowestViewOffset < 0 means no real snapshot exists yet (empty sentinel = -1).
        // In that case start the cursor at 0 so event at offset 0 is not skipped.
        const fromOffset = lowestViewOffset < 0 ? 0 : lowestViewOffset + 1;
        const streamCursor = new EvDbStreamCursor(streamAddress, fromOffset);
        const events = await streamStorageAdapter.getEventsAsync(streamCursor);

        // Only advance streamOffset from -1 if there is at least one real snapshot.
        streamOffset = lowestViewOffset;
        for await (const event of events) {
          views.forEach((view) => view.applyEvent(event));
          streamOffset = event.streamCursor.offset;
        }
      } else {
        // If no snapshot adapter (no views), we can only get the last offset of the events stream
        streamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress);
      }

      return new this.DynamicStreamClass(
        this.config.streamType,
        views,
        streamStorageAdapter,
        streamId,
        streamOffset,
      );
    });
  }

  /**
   * Opens a read-only stream positioned on the event at `offset`.
   *
   * Views start from their latest snapshot at or before `offset` (or from the
   * default state) and fold the stored events up to `offset`. Nothing is
   * stored. Navigate with `forward()`; to go back, call `goToOffset` again.
   *
   * @throws RangeError when `offset` or `pageSize` is invalid, or when the
   *   stream has no event at `offset`.
   */
  public async goToOffset(
    streamId: string,
    offset: number,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    pageSize: number = 100,
  ): Promise<IEvDbReadOnlyStream<TViews>> {
    return withSpan(getCoreTracer(), "eventualize.stream.goToOffset", async (span) => {
      span.setAttribute("eventualize.stream.id", streamId);
      span.setAttribute("eventualize.stream.type", this.config.streamType);
      span.setAttribute("eventualize.stream.offset", offset);

      if (!Number.isInteger(offset) || offset < 0) {
        throw new RangeError(`offset must be a non-negative integer, got ${offset}`);
      }
      if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
      }

      const snapshotAdapter = snapshotStorageAdapter ?? EMPTY_SNAPSHOT_ADAPTER;
      const views = await Promise.all(
        this.config.viewFactories.map((vf) => vf.get(streamId, snapshotAdapter, offset)),
      );

      // Views with no snapshot have storeOffset -1, so this yields 0 for them.
      // min(..., offset) makes sure the event at `offset` itself is fetched.
      const lowestViewOffset = Math.min(...views.map((v) => v.storeOffset));
      const fromOffset = Math.min(lowestViewOffset + 1, offset);

      const target = new this.ReplayStreamClass(
        this.config.streamType,
        views,
        streamStorageAdapter,
        streamId,
        offset,
      );

      return EvDbReadOnlyStream.open<TViews>({
        target,
        streamStorageAdapter,
        streamAddress: new EvDbStreamAddress(this.config.streamType, streamId),
        fromOffset,
        offset,
        pageSize,
      });
    });
  }

  /**
   * Copies a stream, up to `options.offsetLimit` (inclusive), into a new,
   * empty stream of the same type.
   *
   * Events are read in pages and stored after each page. `projectEvent` can
   * change or drop events (default: copy as is, keeping `capturedAt` and
   * `capturedBy`). `projectMessage` can change or drop produced outbox
   * messages (default: drop all, and the producer is not called).
   *
   * @returns The target as a normal writable stream at its head.
   * @throws RangeError for invalid arguments.
   * @throws EvDbCloneError when the target is not empty, or when the copy fails
   *   part-way (pages stored before the failure stay in the target).
   */
  public async clone(
    streamId: string,
    targetStreamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    options: EvDbCloneOptions<TEventMap> = {},
  ): Promise<StreamWithEventMethods<TEventMap, TViews>> {
    const { offsetLimit, pageSize = 100, projectEvent, projectMessage } = options;

    return withSpan(getCoreTracer(), "eventualize.stream.clone", async (span) => {
      span.setAttribute("eventualize.stream.type", this.config.streamType);
      span.setAttribute("eventualize.stream.id", streamId);
      span.setAttribute("eventualize.clone.target_id", targetStreamId);
      if (offsetLimit !== undefined) {
        span.setAttribute("eventualize.clone.offset_limit", offsetLimit);
      }

      if (streamId === targetStreamId) {
        throw new RangeError(`Cannot clone stream ${streamId} into itself`);
      }
      if (offsetLimit !== undefined && (!Number.isInteger(offsetLimit) || offsetLimit < 0)) {
        throw new RangeError(`offsetLimit must be a non-negative integer, got ${offsetLimit}`);
      }
      if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
      }

      const streamType = this.config.streamType;
      const sourceAddress = new EvDbStreamAddress(streamType, streamId);
      const targetAddress = new EvDbStreamAddress(streamType, targetStreamId);

      const targetLastOffset = await streamStorageAdapter.getLastOffsetAsync(targetAddress);
      if (targetLastOffset !== -1) {
        throw new EvDbCloneError(
          `Clone target ${streamType}/${targetStreamId} is not empty (last offset ${targetLastOffset})`,
          {
            sourceStreamId: streamId,
            targetStreamId,
            lastSourceOffset: -1,
            targetStoredOffset: targetLastOffset,
          },
        );
      }

      const sourceHead = await streamStorageAdapter.getLastOffsetAsync(sourceAddress);
      const limit = offsetLimit === undefined ? sourceHead : Math.min(offsetLimit, sourceHead);

      const views = snapshotStorageAdapter
        ? this.createViews(targetStreamId, snapshotStorageAdapter)
        : [];
      const target = new this.CloneStreamClass(
        streamType,
        views,
        streamStorageAdapter,
        targetStreamId,
        -1,
      );

      let nextOffset = 0;
      // Invariant: `lastSourceOffset` is the last source offset fully handled (appended or
      // dropped) whose events are stored in the target. `handledOffset` is the last source
      // offset handled so far, stored or not. A flush covers everything up to `handledAtFlush`.
      let lastSourceOffset = -1;
      let handledOffset = -1;
      let storedBeforeFlush = -1;
      let handledAtFlush = -1;

      const flush = async (): Promise<void> => {
        storedBeforeFlush = target.storedOffset;
        handledAtFlush = handledOffset;
        await target.store();
        lastSourceOffset = handledAtFlush;
        storedBeforeFlush = target.storedOffset;
      };

      try {
        while (nextOffset <= limit) {
          const page = await fetchPage(streamStorageAdapter, sourceAddress, nextOffset, pageSize);
          if (page.length === 0) break;

          for (const e of page) {
            if (e.streamCursor.offset > limit) break;

            const cloned = projectEvent
              ? projectClonedEvent<TEventMap>(e, projectEvent)
              : {
                  eventType: e.eventType,
                  payload: e.payload,
                  capturedAt: e.capturedAt,
                  capturedBy: e.capturedBy,
                };
            if (cloned !== undefined) {
              const staged = target.stageCloned(
                cloned.eventType,
                cloned.payload,
                cloned.capturedAt,
                cloned.capturedBy,
                projectMessage,
              );
              // Store the pending batch first when this event would push it over the limit.
              const itemsToAdd = 1 + staged.messages.length;
              if (
                target.pendingItemCount > 0 &&
                target.pendingItemCount + itemsToAdd > MAX_ITEMS_PER_STORE
              ) {
                await flush();
              }
              target.commitCloned(staged);
            }
            handledOffset = e.streamCursor.offset;
          }

          if (target.countOfPendingEvents > 0) {
            await flush();
          } else {
            lastSourceOffset = handledOffset;
          }
          nextOffset = page[page.length - 1].streamCursor.offset + 1;
        }
      } catch (cause) {
        // store() writes the events first and then saves view snapshots. If a snapshot
        // save fails, the in-flight flush is already in the target, so count it.
        const flushWasStored = target.storedOffset > storedBeforeFlush;
        const reportedSourceOffset = flushWasStored ? handledAtFlush : lastSourceOffset;
        throw new EvDbCloneError(
          `Clone of ${streamType}/${streamId} into ${targetStreamId} failed after source offset ${reportedSourceOffset}`,
          {
            sourceStreamId: streamId,
            targetStreamId,
            lastSourceOffset: reportedSourceOffset,
            targetStoredOffset: target.storedOffset,
            cause,
          },
        );
      }

      return this.get(targetStreamId, streamStorageAdapter, snapshotStorageAdapter);
    });
  }

  public getStreamType(): TStreamType {
    return this.config.streamType;
  }
}

/**
 * Factory function to create a StreamFactory
 */
export function createEvDbStreamFactory<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
>(
  config: EvDbStreamFactoryConfig<TEventMap, TStreamType>,
): IEvDbStreamFactory<TEventMap, TStreamType, TViews> {
  return new EvDbStreamFactory(config);
}

export type { EvDbStreamFactoryConfig, EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
