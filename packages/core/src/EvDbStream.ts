import EvDbEvent from "@eventualize/types/EvDbEvent";
import type EvDbMessage from "@eventualize/types/EvDbMessage";
import type IEvDbStorageStreamAdapter from "@eventualize/types/IEvDbStorageStreamAdapter";
import type IEvDbView from "@eventualize/types/IEvDbView";
import EvDbStreamAddress from "@eventualize/types/EvDbStreamAddress";
import type IEvDbViewStore from "@eventualize/types/IEvDbViewStore";
import type IEvDbStreamStore from "@eventualize/types/IEvDbStreamStore";
import type IEvDbStreamStoreData from "@eventualize/types/IEvDbStreamStoreData";
import type IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";
import StreamStoreAffected from "@eventualize/types/StreamStoreAffected";
import type IEvDbEventMetadata from "@eventualize/types/IEvDbEventMetadata";
import EvDbStreamCursor from "@eventualize/types/EvDbStreamCursor";
import OCCException from "@eventualize/types/OCCException";
import type { EvDbStreamType } from "@eventualize/types/primitiveTypes";
import type EVDbMessagesProducer from "@eventualize/types/EvDbMessagesProducer";
import type { EvDbView } from "./EvDbView.js";

type ImmutableIEvDbView = Readonly<EvDbView<unknown>>;
export type ImmutableIEvDbViewMap = Readonly<Record<string, ImmutableIEvDbView>>;

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

  getViews(): ImmutableIEvDbViewMap {
    return this._views;
  }

  getView(viewName: string): Readonly<IEvDbView> | undefined {
    return this._views[viewName];
  }

  // Events
  /**
   * Unspecialized events
   */
  getEvents(): ReadonlyArray<EvDbEvent> {
    return this._pendingEvents;
  }

  // StreamAddress
  public streamAddress: EvDbStreamAddress;

  // StoredOffset
  public storedOffset: number;

  // Constructor
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

  // AppendToOutbox
  /**
   * Put a row into the publication (out-box pattern).
   */
  public appendToOutbox(e: EvDbMessage): void {
    this._pendingMessages = [...this._pendingMessages, e];
  }

  // StoreAsync
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

  // CountOfPendingEvents
  /**
   * number of events that were not stored yet.
   */
  public get countOfPendingEvents(): number {
    return this._pendingEvents.length;
  }

  // Notifications
  /**
   * Unspecialized messages
   */
  public getMessages(): ReadonlyArray<EvDbMessage> {
    return this._pendingMessages;
  }
}
