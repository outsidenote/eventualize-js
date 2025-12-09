import { EvDbView } from '@eventualize/entities-types/EvDbView';
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";
import IEvDbEventMetadata from '@eventualize/types/IEvDbEventMetadata';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import { EvDbStoredSnapshotResult } from '@eventualize/types/EvDbStoredSnapshotResult';

/**
 * Handler function type for applying an event to state
 */
export type EvDbViewEventHandler<TState, TEvent extends IEvDbEventPayload> = (
    oldState: TState,
    event: TEvent,
    metadata: IEvDbEventMetadata
) => TState;

/**
 * Map of event handlers - one handler per event type in the union
 * Key is the payloadType string, value is the handler function
 */
export type EvDbStreamEventHandlersMap<TState, TEvents extends IEvDbEventPayload> = {
    [K in TEvents['payloadType']]: EvDbViewEventHandler<
        TState,
        Extract<TEvents, { payloadType: K }>
    >;
};
/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends IEvDbEventPayload> {
    viewName: string;
    streamType: string;
    defaultState: TState;
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>;
}

/**
 * Generic View class that uses the handlers map
 */
class GenericView<TState, TEvents extends IEvDbEventPayload> extends EvDbView<TState> {

    constructor(
        viewAddress: EvDbViewAddress,
        storedAt: Date | undefined,
        storeOffset: number,
        memoryOffset: number,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        snapshot: EvDbStoredSnapshotResult<TState>,
        public readonly config: ViewConfig<TState, TEvents>
    ) {
        super(viewAddress, storedAt, storeOffset, memoryOffset, storageAdapter, snapshot, config.defaultState);
        this.config = config;
    }


    /**
     * Dynamically applies events based on the handlers map
     */
    public handleOnApply(oldState: TState, event: TEvents, metadata: IEvDbEventMetadata): TState {
        const payloadType = event.payloadType as keyof typeof this.config.handlers;
        const handler = this.config.handlers[payloadType];

        if (!handler) {
            // console.warn(`No handler found for event type: ${event.payloadType}`);
            return oldState;
        }

        return handler(oldState, event as any, metadata);
    }
}

/**
 * View Factory - creates view instances with the handlers map
 */
export class ViewFactory<TState, TEvents extends IEvDbEventPayload> {
    constructor(private readonly config: ViewConfig<TState, TEvents>) { }

    /**
     * Creates a view instance
     */
    public create(
        streamId: string,
        storageAdapter: IEvDbStorageSnapshotAdapter
    ): EvDbView<TState> {
        const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
        const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

        return new GenericView<TState, TEvents>(
            viewAddress,
            undefined,
            0,
            0,
            storageAdapter,
            EvDbStoredSnapshotResult.getEmptyState<TState>(),
            this.config
        );
    }
}

/**
 * Factory function to create a ViewFactory
 */
export function createViewFactory<TState, TEvents extends IEvDbEventPayload>(
    config: ViewConfig<TState, TEvents>
): ViewFactory<TState, TEvents> {
    return new ViewFactory(config);
}

