import { EvDbView } from './EvDbView.js';
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
 * Apply function type for pure state transitions
 */
export type ApplyFn<TState, TEvents extends IEvDbEventPayload> = (
    state: TState,
    event: TEvents,
    metadata: IEvDbEventMetadata
) => TState;

/**
 * Snapshot-like structure for hydration.
 * More general than EvDbStoredSnapshotResult - works with checkpoints, partial snapshots, etc.
 */
export type SnapshotLike<TState> = {
    offset: number;
    state?: TState;
};

/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends IEvDbEventPayload> {
    viewName: string;
    streamType: string;
    defaultState: TState;
    handlers: Partial<EvDbStreamEventHandlersMap<TState, TEvents>>;
    /**
     * Custom state cloning function. Defaults to structuredClone for objects.
     * Use this for large states where you can provide a more efficient clone.
     */
    cloneState?: (state: TState) => TState;
}

/**
 * Generic View class that uses the handlers map
 */
class GenericView<TState, TEvents extends IEvDbEventPayload> extends EvDbView<TState> {

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
    public handleOnApply(oldState: TState, event: TEvents, metadata: IEvDbEventMetadata): TState {
        const payloadType = event.payloadType as keyof typeof this.config.handlers;
        const handler = this.config.handlers[payloadType];

        if (!handler) {
            return oldState;
        }

        return (handler as EvDbViewEventHandler<TState, TEvents>)(oldState, event, metadata);
    }
}

/**
 * View Factory - creates view instances with the handlers map
 */
export class ViewFactory<TState, TEvents extends IEvDbEventPayload> {
    private _cachedApplyFn?: ApplyFn<TState, TEvents>;

    constructor(private readonly config: ViewConfig<TState, TEvents>) { }

    /**
     * Public accessor for stream type.
     * Exposed to avoid unsafe (factory as any).config.streamType casts in consuming code.
     */
    get streamType(): string {
        return this.config.streamType;
    }

    /**
     * Public accessor for view name.
     * Exposed to avoid unsafe (factory as any).config.viewName casts in consuming code.
     */
    get viewName(): string {
        return this.config.viewName;
    }

    /**
     * Public accessor for default state.
     * Exposed to avoid unsafe (factory as any).config.defaultState casts in consuming code.
     */
    get defaultState(): TState {
        return this.config.defaultState;
    }

    /**
     * Cached pure reducer function for applying events to state.
     * Primary API for state transitions - avoids View instantiation overhead.
     */
    get reducer(): ApplyFn<TState, TEvents> {
        return this.getApplyFunction();
    }

    /**
     * Returns a cloned initial state. Safe for multiple consumers.
     */
    public initialState(): TState {
        return this.cloneState(this.config.defaultState);
    }

    /**
     * Clones a state value using the configured clone function or structuredClone.
     * 
     * This prevents multiple consumers (e.g., multiple Stepper instances) from
     * sharing the same mutable state object. Without cloning, mutations in one
     * stepper would affect others, leading to subtle bugs.
     */
    public cloneState(state: TState): TState {
        if (this.config.cloneState) {
            return this.config.cloneState(state);
        }
        if (state === null || typeof state !== 'object') {
            return state;
        }
        return structuredClone(state);
    }

    /**
     * @deprecated Use initialState() instead
     */
    public cloneDefaultState(): TState {
        return this.initialState();
    }

    /**
     * Creates a view instance pre-hydrated with snapshot-like state.
     * 
     * Accepts SnapshotLike for flexibility - works with:
     * - EvDbStoredSnapshotResult from adapters
     * - Stepper checkpoints
     * - Test mocks
     * 
     * This is used by TimeTraveler to avoid the double-replay problem:
     * - The old approach called get() which internally loads snapshot + replays
     * - TimeTraveler then replayed events again on top
     * 
     * By using createHydrated(), the caller owns the replay loop and the view
     * is simply initialized with the snapshot state. No double work.
     */
    public createHydrated(
        streamId: string,
        storageAdapter: IEvDbStorageSnapshotAdapter,
        snapshot: SnapshotLike<TState>
    ): EvDbView<TState> {
        const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
        const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

        const snapshotResult = new EvDbStoredSnapshotResult<TState>(
            snapshot.offset,
            undefined,
            snapshot.state as TState
        );

        return new GenericView<TState, TEvents>(
            viewAddress,
            storageAdapter,
            snapshotResult,
            this.config
        );
    }

    /**
     * Returns a cached pure reducer function for applying events to state.
     * 
     * This enables O(1) event application without creating a new View instance
     * per event. The Stepper uses this to avoid O(N²) allocations when stepping
     * through N events - it creates the apply function once and reuses it.
     * 
     * The function is cached so repeated calls return the same instance.
     */
    public getApplyFunction(): ApplyFn<TState, TEvents> {
        if (this._cachedApplyFn) {
            return this._cachedApplyFn;
        }

        this._cachedApplyFn = (state: TState, event: TEvents, metadata: IEvDbEventMetadata): TState => {
            const payloadType = event.payloadType as keyof typeof this.config.handlers;
            const handler = this.config.handlers[payloadType];

            if (!handler) {
                return state;
            }

            return (handler as EvDbViewEventHandler<TState, TEvents>)(state, event, metadata);
        };

        return this._cachedApplyFn;
    }

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
export function createViewFactory<TState, TEvents extends IEvDbEventPayload>(
    config: ViewConfig<TState, TEvents>
): ViewFactory<TState, TEvents> {
    return new ViewFactory(config);
}
