import { EvDbView } from './EvDbView.js';
import IEvDbPayload from "@eventualize/types/IEvDbPayload";
import IEvDbStreamEventMetadata from '@eventualize/types/IEvDbEventMetadata';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import EvDbViewAddress from '@eventualize/types/EvDbViewAddress';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import { EvDbStoredSnapshotResult } from '@eventualize/types/EvDbStoredSnapshotResult';
import EvDbStreamEvent, { EvDbEvent, EvDbStreamEventRaw } from '@eventualize/types/EvDbEvent';

/**
 * Handler function type for applying an event to state
 */
export type EvDbViewEventHandler<TState, TEvent extends EvDbStreamEventRaw> = (
    oldState: TState,
    event: TEvent,
) => TState;

/**
 * Map of event handlers - one handler per event type in the union
 * Key is the payloadType string, value is the handler function
 */
export type EvDbStreamEventHandlersMap<TState, TEvents extends EvDbStreamEventRaw> = {
    [K in TEvents['eventType']]: EvDbViewEventHandler<
        TState,
        Extract<TEvents, { payloadType: K }>
    >;
};
/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends EvDbStreamEventRaw> {
    viewName: string;
    streamType: string;
    defaultState: TState;
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>;
}

/**
 * Generic View class that uses the handlers map
 */
class GenericView<TState, TEvents extends EvDbStreamEventRaw> extends EvDbView<TState> {

    constructor(
        viewAddress: EvDbViewAddress,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        snapshot: EvDbStoredSnapshotResult<TState>,
        public readonly config: ViewConfig<TState, TEvents>
    ) {
        super(viewAddress, storageAdapter, snapshot, config.defaultState);
        this.config = config;
    }


    /**
     * Dynamically applies events based on the handlers map
     */
    public handleOnApply(oldState: TState, event: TEvents): TState {
        const eventTyps = event.eventType as keyof typeof this.config.handlers;
        const handler = this.config.handlers[eventTyps];

        if (!handler) {
            // console.warn(`No handler found for event type: ${event.payloadType}`);
            return oldState;
        }

        return handler(oldState, event as any);
    }
}

/**
 * View Factory - creates view instances with the handlers map
 */
export class ViewFactory<TState, TEvents extends EvDbStreamEventRaw> {
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
            storageAdapter,
            EvDbStoredSnapshotResult.getEmptyState<TState>(),
            this.config
        );
    }

    /**
     * Get a view instance from event store
     */
    public async get(
        streamId: string,
        storageAdapter: IEvDbStorageSnapshotAdapter
    ): Promise<EvDbView<TState>> {
        const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
        const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

        const snapshot = await storageAdapter.getSnapshotAsync(viewAddress)

        return new GenericView<TState, TEvents>(
            viewAddress,
            storageAdapter,
            snapshot,
            this.config
        );
    }
}

/**
 * Factory function to create a ViewFactory
 */
export function createViewFactory<TState, TEvents extends EvDbStreamEventRaw>(
    config: ViewConfig<TState, TEvents>
): ViewFactory<TState, TEvents> {
    return new ViewFactory(config);
}

