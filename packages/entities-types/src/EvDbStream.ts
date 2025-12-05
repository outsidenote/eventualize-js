import EvDbEvent from "./EvDbEvent";
import EvDbMessage from "./EvDbMessage";
import IEvDbStorageStreamAdapter from "./IEvDbStorageStreamAdapter";
import IEvDbView from "./IEvDbView";
import EvDbStreamAddress from "./EvDbStreamAddress";
import IEvDbViewStore from "./IEvDbViewStore";
import IEvDbStreamStore from "./IEvDbStreamStore";
import IEvDbStreamStoreData from "./IEvDbStreamStoreData";
import IEvDbEventPayload from "./IEvDbEventPayload";
import StreamStoreAffected from "./StreamStoreAffected";
import IEvDbEventMetadata from "./IEvDbEventMetadata";
import EvDbStreamCursor from "./EvDbStreamCursor";
import IEvDbStreamConfig from "./IEvDbStreamConfig";
import IEvDbOutboxProducer from "./IEvDbOutboxProducer";

export default abstract class EvDbStream implements IEvDbStreamStore, IEvDbStreamStoreData {

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
    protected readonly _views: ReadonlyArray<IEvDbView>;

    getViews(): ReadonlyArray<IEvDbView> {
        return this._views;
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
    protected constructor(
        streamConfiguration: IEvDbStreamConfig,
        views: ReadonlyArray<IEvDbViewStore>,
        storageAdapter: IEvDbStorageStreamAdapter,
        streamId: string,
        lastStoredOffset: number
    ) {
        this._views = views;
        this._storageAdapter = storageAdapter;
        this.streamAddress = new EvDbStreamAddress(
            streamConfiguration.streamType,
            streamId
        );
        this.storedOffset = lastStoredOffset;
    }

    // AppendEventAsync
    protected async appendEventAsync<T extends IEvDbEventPayload>(
        payload: T,
        capturedBy?: string | null
    ): Promise<IEvDbEventMetadata> {
        capturedBy = capturedBy ?? EvDbStream.DEFAULT_CAPTURE_BY;
        const json = JSON.stringify(payload); // Or use custom serializer

        // Lock and add to pending events
        const release = await this._sync.acquire();
        try {
            const pending = this._pendingEvents;
            const cursor = this.getNextCursor(pending);
            const e = new EvDbEvent(
                payload.payloadType,
                cursor,
                json,
                new Date(),
                capturedBy,
            );
            this._pendingEvents = [...pending, e];

            // Apply to views
            for (const folding of this._views) {
                folding.applyEvent(e);
            }

            // Outbox producer
            this.outboxProducer?.onProduceOutboxMessages(e, this._views);

            return e;
        } finally {
            release();
        }
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
    async storeAsync(cancellation?: AbortSignal): Promise<StreamStoreAffected> {
        // Telemetry
        // const tags = this.streamAddress.toOtelTags();
        // const duration = EvDbStream._sysMeters.measureStoreEventsDuration(tags);
        // const activity = EvDbStream._trace.startActivity(tags, 'EvDb.Store');

        const release = await this._sync.acquire();
        try {
            const events = this._pendingEvents;
            const outbox = this._pendingOutput;

            if (events.length === 0) {
                return StreamStoreAffected.Empty;
            }

            try {
                const affected = await this._storageAdapter.storeStreamAsync(
                    events,
                    outbox,
                    cancellation
                );

                // Telemetry
                EvDbStream._sysMeters.eventsStored.add(affected.events, tags);
                for (const [shardName, count] of Object.entries(affected.messages)) {
                    const tgs = { ...tags, [TAG_SHARD_NAME]: shardName };
                    EvDbStream._sysMeters.messagesStored.add(count, tgs);
                }

                const lastEvent = events[events.length - 1];
                this.storedOffset = lastEvent.streamCursor.offset;

                const viewSaveTasks = this._views.map(v => v.saveAsync(cancellation));
                await Promise.all(viewSaveTasks);

                const clearPendingActivity = EvDbStream._trace.startActivity(
                    tags,
                    'EvDb.ClearPending'
                );
                this._pendingEvents = [];
                this._pendingOutput = [];

                clearPendingActivity?.dispose();
                return affected;
            } catch (error) {
                if (error instanceof OCCException) {
                    EvDbStream._sysMeters.occ.add(1);
                    throw error;
                }
                throw error;
            }
        } finally {
            release();
            duration?.dispose();
            activity?.dispose();
        }
    }

    // CountOfPendingEvents
    /**
     * number of events that were not stored yet.
     */
    get countOfPendingEvents(): number {
        return this._pendingEvents.length;
    }

    // Notifications
    /**
     * Unspecialized messages
     */
    getMessages(): ReadonlyArray<EvDbMessage> {
        return this._pendingOutput;
    }

    // Dispose Pattern
    /**
     * Performs application-defined tasks associated with freeing, releasing, or resetting unmanaged resources.
     */
    public dispose(): void {
        this._sync.dispose();
        this.disposeCore(true);
    }

    protected disposeCore(disposed: boolean): void {
        // Override in derived classes
    }
}