import EvDbEvent from "@eventualize/types/EvDbEvent";
import EvDbMessage from "./EvDbMessage.js";
import IEvDbStorageStreamAdapter from "./IEvDbStorageStreamAdapter.js";
import IEvDbView from "./IEvDbView.js";
import EvDbStreamAddress from "@eventualize/types/EvDbStreamAddress";
import IEvDbViewStore, { ImmutableIEvDbViewStoreMap } from "./IEvDbViewStore.js";
import IEvDbStreamStore from "./IEvDbStreamStore.js";
import IEvDbStreamStoreData from "./IEvDbStreamStoreData.js";
import IEvDbEventPayload from "./IEvDbEventPayload.js";
import StreamStoreAffected from "@eventualize/types/StreamStoreAffected";
import IEvDbEventMetadata from "./IEvDbEventMetadata.js";
import EvDbStreamCursor from "./EvDbStreamCursor.js";
import IEvDbOutboxProducer from "./IEvDbOutboxProducer.js";
import OCCException from "@eventualize/types/OCCException";
import { EvDbStreamType } from "./primitiveTypes.js";



export default class EvDbStream implements IEvDbStreamStore, IEvDbStreamStoreData {

    protected _pendingEvents: ReadonlyArray<EvDbEvent> = [];
    protected _pendingOutput: ReadonlyArray<EvDbMessage> = [];

    private static readonly ASSEMBLY_NAME = {
        name: 'evdb-core',
        version: '1.0.0'
    };

    private static readonly DEFAULT_CAPTURE_BY =
        `${EvDbStream.ASSEMBLY_NAME.name}-${EvDbStream.ASSEMBLY_NAME.version}`;

    private readonly _storageAdapter: IEvDbStorageStreamAdapter;

    // Views
    protected readonly _views: ImmutableIEvDbViewStoreMap;

    getViews(): ImmutableIEvDbViewStoreMap {
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
        views: ReadonlyArray<IEvDbViewStore>,
        storageAdapter: IEvDbStorageStreamAdapter,
        streamId: string,
        lastStoredOffset: number
    ) {
        this._views = views.reduce((acc, view) => {
            const viewName = view.address.viewName;
            acc[viewName] = view;
            return acc;
        }, {} as Record<string, IEvDbViewStore>);
        this._storageAdapter = storageAdapter;
        this.streamAddress = new EvDbStreamAddress(streamType, streamId);
        this.storedOffset = lastStoredOffset;
    }

    public appendEvent(
        payload: IEvDbEventPayload,
        capturedBy?: string | null
    ): IEvDbEventMetadata {
        capturedBy = capturedBy ?? EvDbStream.DEFAULT_CAPTURE_BY;
        // const json = JSON.stringify(payload); // Or use custom serializer

        const cursor = this.getNextCursor(this._pendingEvents);
        const e = new EvDbEvent(
            payload.payloadType,
            cursor,
            payload,
            new Date(),
            capturedBy,
        );
        this._pendingEvents = [...this._pendingEvents, e];

        // Apply to views
        for (const folding of Object.values(this._views)) {
            folding.applyEvent(e);
        }

        // Outbox producer
        this.outboxProducer?.onProduceOutboxMessages(e, Object.values(this._views));

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

    // IEvDbOutboxProducer
    /**
     * Produce messages into outbox based on an event and states.
     */
    protected get outboxProducer(): IEvDbOutboxProducer | undefined {
        return undefined;
    }

    // AppendToOutbox
    /**
     * Put a row into the publication (out-box pattern).
     */
    public appendToOutbox(e: EvDbMessage): void {
        this._pendingOutput = [...this._pendingOutput, e];
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
                this._pendingOutput,
            );


            const lastEvent = this._pendingEvents[this._pendingEvents.length - 1];
            this.storedOffset = lastEvent.streamCursor.offset;

            const viewSaveTasks = Object.values(this._views).map(v => v.store());
            await Promise.all(viewSaveTasks);


            this._pendingEvents = [];
            this._pendingOutput = [];

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
        return this._pendingOutput;
    }
}