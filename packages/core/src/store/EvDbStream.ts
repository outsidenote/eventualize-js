import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type IEvDbView from "@eventualize/types/view/IEvDbView";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type IEvDbViewStore from "@eventualize/types/view/IEvDbViewStore";
import type IEvDbStreamStore from "@eventualize/types/store/IEvDbStreamStore";
import type IEvDbStreamStoreData from "@eventualize/types/store/IEvDbStreamStoreData";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import OCCException from "@eventualize/types/primitives/OCCException";
import type { EvDbStreamType } from "@eventualize/types/primitives/EvDbStreamType";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type { EvDbView } from "../view/EvDbView.js";

type ImmutableIEvDbView = Readonly<EvDbView<unknown>>;

/**
 * A read-only map of view name to view instance for a stream.
 * Use this type when you need to pass or store the full set of a stream's views
 * without allowing structural mutation.
 */
export type ImmutableIEvDbViewMap = Readonly<Record<string, ImmutableIEvDbView>>;

/**
 * Core event-sourcing stream that coordinates event appending, view projection,
 * outbox message production, and optimistic-concurrency-controlled persistence.
 *
 * Use `EvDbStream` as the base class for all domain streams. It implements
 * `IEvDbStreamStore` (store/query pending events) and `IEvDbStreamStoreData`
 * (access unspecialized events, messages, and views) so consumers can work
 * against those interfaces without coupling to this concrete class.
 */
export default class EvDbStream implements IEvDbStreamStore, IEvDbStreamStoreData {
  protected _pendingEvents: ReadonlyArray<EvDbEvent> = [];
  protected _pendingMessages: ReadonlyArray<EvDbMessage> = [];

  private static readonly ASSEMBLY_NAME = {
    name: "evdb-core",
    version: "1.0.0",
  };

  private static readonly DEFAULT_CAPTURE_BY = `${EvDbStream.ASSEMBLY_NAME.name}-${EvDbStream.ASSEMBLY_NAME.version}`;

  private readonly _storageAdapter: IEvDbStorageStreamAdapter;

  // Views
  protected readonly _views: ImmutableIEvDbViewMap;

  /**
   * Returns all views registered on this stream, keyed by view name.
   * Use this when you need to inspect or iterate over every projection without
   * knowing the view names up-front (e.g. generic tooling or serialization).
   */
  getViews(): ImmutableIEvDbViewMap {
    return this._views;
  }

  /**
   * Returns a single view by its name, or `undefined` if not registered.
   * Use this for targeted access to a specific projection when you know the
   * view name at call-site (prefer typed accessors on concrete subclasses when
   * available).
   */
  getView(viewName: string): Readonly<IEvDbView> | undefined {
    return this._views[viewName];
  }

  /**
   * Returns the full list of pending (not-yet-stored) events as untyped
   * `EvDbEvent` instances.
   * Use this when you need generic/unspecialized access to the pending event
   * list, e.g. for logging, debugging, or framework-level inspection.
   * Strongly-typed subclasses may expose a narrower accessor instead.
   */
  getEvents(): ReadonlyArray<EvDbEvent> {
    return this._pendingEvents;
  }

  /**
   * The unique address that identifies this stream instance, combining the
   * stream type and stream ID.
   * Use this to correlate events, cursors, and log entries back to a specific
   * stream without holding a reference to the full stream object.
   */
  public streamAddress: EvDbStreamAddress;

  /**
   * The offset of the last event successfully persisted to storage.
   * Use this to determine the persistence watermark of the stream — it is
   * updated after each successful `store()` call and drives OCC conflict
   * detection on the next write.
   */
  public storedOffset: number;

  /**
   * Constructs a new stream instance, wiring together storage, views, and
   * the outbox message producer.
   *
   * You should not call this constructor directly; use the stream factory
   * (e.g. `EvDbStreamFactory`) so that the adapter, views, and producer are
   * configured consistently.
   *
   * @param streamType    - Descriptor that categorises the stream (domain + version).
   * @param views         - Projection views that fold events into query-ready state.
   * @param storageAdapter - Adapter used to persist events and outbox messages.
   * @param streamId      - Instance-level identifier that, together with `streamType`,
   *                        uniquely addresses this stream.
   * @param lastStoredOffset - Offset of the last event already in storage; used as
   *                           the starting cursor and for OCC checks.
   * @param messagesProducer - Function invoked after each `appendEvent` to derive
   *                           outbox messages from the new event and current view states.
   */
  public constructor(
    streamType: EvDbStreamType,
    views: ImmutableIEvDbView[],
    storageAdapter: IEvDbStorageStreamAdapter,
    streamId: string,
    lastStoredOffset: number,
    protected messagesProducer: EVDbMessagesProducer,
  ) {
    this._views = views.reduce((acc, view) => {
      const viewName = view.address.viewName;
      acc[viewName] = view;
      return acc;
    }, {} as Record<string, IEvDbViewStore>) as ImmutableIEvDbViewMap;
    this._storageAdapter = storageAdapter;
    this.streamAddress = new EvDbStreamAddress(streamType, streamId);
    this.storedOffset = lastStoredOffset;
  }

  /**
   * Appends a domain event to the pending list, applies it to all registered
   * views, and invokes the outbox producer to derive any resulting messages.
   *
   * Use this in concrete subclass methods (e.g. `deposited(amount)`) rather than
   * calling storage directly. The event is **not** persisted until `store()` is
   * called, so multiple `appendEvent` calls can be batched into a single atomic
   * write.
   *
   * @param payload    - Typed event payload; `payloadType` must match a type
   *                     registered on this stream's factory.
   * @param capturedBy - Optional label identifying who/what produced this event
   *                     (defaults to the core assembly identifier).
   * @returns The populated event metadata (cursor, timestamp, capturedBy).
   */
  protected appendEvent(
    payload: IEvDbEventPayload,
    capturedBy?: string | null,
  ): IEvDbEventMetadata {
    capturedBy = capturedBy ?? EvDbStream.DEFAULT_CAPTURE_BY;
    // const json = JSON.stringify(payload); // Or use custom serializer

    const cursor = this.getNextCursor(this._pendingEvents);
    const e = new EvDbEvent(payload.payloadType, cursor, payload, new Date(), capturedBy);
    this._pendingEvents = [...this._pendingEvents, e];

    // Apply to views
    for (const view of Object.values(this._views)) {
      view.applyEvent(e);
    }

    // Outbox producer
    const viewsStates = Object.fromEntries(
      Object.entries(this._views).map(([k, v]) => {
        return [k, (v as EvDbView<unknown>).state];
      }),
    );
    const producedMessages = this.messagesProducer(e, viewsStates);
    this._pendingMessages = [...this._pendingMessages, ...producedMessages];

    return e;
  }

  private getNextCursor(events: ReadonlyArray<EvDbEvent>): EvDbStreamCursor {
    if (events.length === 0) {
      return new EvDbStreamCursor(this.streamAddress, this.storedOffset + 1);
    }

    const lastEvent = events[events.length - 1];
    const offset = lastEvent.streamCursor.offset;
    return new EvDbStreamCursor(this.streamAddress, offset + 1);
  }

  /**
   * Manually inserts a message into the pending outbox without going through
   * the domain event flow.
   *
   * Use this when you need to publish a notification or integration event that
   * is not a direct consequence of a domain event — for example, a saga
   * coordination message or a manually triggered notification. For event-driven
   * messages prefer the `messagesProducer` callback passed to the constructor,
   * which fires automatically inside `appendEvent`.
   */
  public appendToOutbox(e: EvDbMessage): void {
    this._pendingMessages = [...this._pendingMessages, e];
  }

  /**
   * Atomically persists all pending events and outbox messages to storage,
   * advances `storedOffset`, potentialy saves view snapshots, and clears the pending
   * buffers.
   *
   * Use this once you have finished building up a unit of work via one or more
   * `appendEvent` / `appendToOutbox` calls. The call is a no-op (returns
   * `StreamStoreAffected.Empty`) when there are no pending events. Throws
   * `OCCException` if another writer has already stored events at or beyond
   * the current `storedOffset` (optimistic concurrency conflict).
   *
   * @returns A `StreamStoreAffected` value describing how many events and
   *          outbox messages were written.
   */
  public async store(): Promise<StreamStoreAffected> {
    // Telemetry
    // const tags = this.streamAddress.toOtelTags();
    // const duration = EvDbStream._sysMeters.measureStoreEventsDuration(tags);
    // const activity = EvDbStream._trace.startActivity(tags, 'EvDb.Store');

    try {
      if (this._pendingEvents.length === 0) {
        return StreamStoreAffected.Empty;
      }

      const affected = await this._storageAdapter.storeStreamAsync(
        this._pendingEvents,
        this._pendingMessages,
      );

      const lastEvent = this._pendingEvents[this._pendingEvents.length - 1];
      this.storedOffset = lastEvent.streamCursor.offset;
      this._pendingEvents = [];
      this._pendingMessages = [];

      const viewSaveTasks = Object.values(this._views).map((v) => v.store());
      await Promise.all(viewSaveTasks);

      return affected;
    } catch (error) {
      if (error instanceof OCCException) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * The number of events appended since the last successful `store()` call.
   * Use this to guard against accidentally calling `store()` with an empty
   * batch or to implement pre-store validation that requires at least one event.
   */
  public get countOfPendingEvents(): number {
    return this._pendingEvents.length;
  }

  /**
   * Returns the full list of pending outbox messages (integration events,
   * notifications, saga commands) that have not yet been stored.
   * Use this for generic/unspecialized access — e.g. framework-level
   * inspection, testing, or logging — when you do not need message-type
   * discrimination. Persisted alongside events during `store()`.
   */
  public getMessages(): ReadonlyArray<EvDbMessage> {
    return this._pendingMessages;
  }
}
