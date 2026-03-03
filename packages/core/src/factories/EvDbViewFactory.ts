import { EvDbView } from "../view/EvDbView.js";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import { EvDbStoredSnapshotResult } from "@eventualize/types/snapshots/EvDbStoredSnapshotResult";
import type { ViewConfig } from "./EvDbViewFactoryTypes.js";

/**
 * Generic View class that uses the handlers map
 */
class GenericView<TState, TEvents extends { readonly eventType: string }> extends EvDbView<TState> {
  constructor(
    viewAddress: EvDbViewAddress,
    storageAdapter: IEvDbStorageSnapshotAdapter,
    snapshot: EvDbStoredSnapshotResult<TState>,
    public readonly config: ViewConfig<TState, TEvents>,
  ) {
    super(viewAddress, storageAdapter, snapshot, config.defaultState);
    this.config = config;
  }

  /**
   * Dynamically applies events based on the handlers map.
   * Dispatches by eventType; passes event.payload as the typed event data to the handler.
   */
  public handleOnApply(oldState: TState, event: EvDbEvent): TState {
    const eventType = event.eventType as keyof typeof this.config.handlers;
    const handler = this.config.handlers[eventType];

    if (!handler) {
      return oldState;
    }

    return handler(
      oldState,
      event.payload as Extract<TEvents, { eventType: typeof eventType }>,
      event,
    );
  }
}

/**
 * View Factory - creates view instances with the handlers map
 */
export class ViewFactory<TState, TEvents extends { readonly eventType: string }> {
  constructor(private readonly config: ViewConfig<TState, TEvents>) {}

  /**
   * Creates a view instance
   */
  public create(streamId: string, storageAdapter: IEvDbStorageSnapshotAdapter): EvDbView<TState> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
    const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

    return new GenericView<TState, TEvents>(
      viewAddress,
      storageAdapter,
      EvDbStoredSnapshotResult.getEmptyState<TState>(),
      this.config,
    );
  }

  /**
   * Get a view instance from event store
   */
  public async get(
    streamId: string,
    storageAdapter: IEvDbStorageSnapshotAdapter,
  ): Promise<EvDbView<TState>> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
    const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

    const rawSnapshot = await storageAdapter.getSnapshotAsync(viewAddress);
    const snapshot = new EvDbStoredSnapshotResult<TState>(
      rawSnapshot.offset,
      rawSnapshot.storedAt,
      rawSnapshot.state as TState,
    );

    return new GenericView<TState, TEvents>(viewAddress, storageAdapter, snapshot, this.config);
  }
}

/**
 * Factory function to create a ViewFactory
 */
export function createViewFactory<TState, TEvents extends { readonly eventType: string }>(
  config: ViewConfig<TState, TEvents>,
): ViewFactory<TState, TEvents> {
  return new ViewFactory(config);
}

export type { EvDbStreamEventHandlersMap, ViewConfig } from "./EvDbViewFactoryTypes.js";
