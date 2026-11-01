import { EvDbView } from "../view/EvDbView.js";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import { EvDbStoredSnapshotResult } from "@eventualize/types/snapshots/EvDbStoredSnapshotResult";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type { ViewConfig } from "./EvDbViewFactoryTypes.js";

/**
 * Generic View class that uses the handlers map
 */
class GenericView<TState, TEventMap extends Record<string, object>> extends EvDbView<TState> {
  constructor(
    viewAddress: EvDbViewAddress,
    storageAdapter: IEvDbStorageSnapshotAdapter,
    snapshot: EvDbStoredSnapshotResult<TState>,
    public readonly config: ViewConfig<TState, TEventMap>,
  ) {
    super(viewAddress, storageAdapter, snapshot, config.defaultState);
    this.config = config;
  }

  public override shouldStoreSnapshot(offsetGap: number, durationGapMs: number): boolean {
    const strategy = this.config.snapshotStrategy;
    return strategy === undefined ? true : strategy.shouldStore({ offsetGap, durationGapMs });
  }

  protected override matchesSnapshotEvent(e: EvDbEvent): boolean {
    const strategy = this.config.snapshotStrategy;
    return strategy === undefined ? false : strategy.matchesEvent(this.state, e.payload, e);
  }

  /**
   * An event type with no handler cannot change the state, so it is skipped and reports no change.
   */
  protected override onApplyEvent(e: EvDbEvent): boolean {
    // Own keys only: an event named like an Object.prototype member has no handler.
    if (!Object.prototype.hasOwnProperty.call(this.config.handlers, e.eventType)) {
      return false;
    }
    const previous = this.state;
    super.onApplyEvent(e);
    // "trusted": a handler that returns the same reference is taken as "no change".
    return this.config.snapshotStrategy?.changeDetection !== "trusted" || this.state !== previous;
  }

  /**
   * Dynamically applies events based on the handlers map
   */
  public handleOnApply(
    oldState: TState,
    event: IEvDbPayloadData,
    metadata: IEvDbEventMetadata,
  ): TState {
    const eventType = metadata.eventType as keyof typeof this.config.handlers;
    const handler = this.config.handlers[eventType];

    if (!handler) {
      return oldState;
    }

    return (handler as (s: TState, e: IEvDbPayloadData, m: IEvDbEventMetadata) => TState)(
      oldState,
      event,
      metadata,
    );
  }
}

/**
 * View Factory - creates view instances with the handlers map
 */
export class ViewFactory<TState, TEventMap extends Record<string, object>> {
  constructor(private readonly config: ViewConfig<TState, TEventMap>) {}

  /**
   * Creates a view instance
   */
  public create(streamId: string, storageAdapter: IEvDbStorageSnapshotAdapter): EvDbView<TState> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
    const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

    return new GenericView<TState, TEventMap>(
      viewAddress,
      storageAdapter,
      EvDbStoredSnapshotResult.getEmptyState<TState>(),
      this.config,
    );
  }

  /**
   * Get a view instance from event store.
   * @param streamId - The id of the stream that the view belongs to.
   * @param storageAdapter - The adapter that the snapshot is read from.
   * @param maxOffset - Optional: load the latest snapshot at or before this offset.
   *   A snapshot newer than `maxOffset` (from an adapter that ignores the bound)
   *   is discarded, so the view starts from its default state.
   * @returns The view, loaded from its snapshot, or in its default state when there is none.
   */
  public async get(
    streamId: string,
    storageAdapter: IEvDbStorageSnapshotAdapter,
    maxOffset?: number,
  ): Promise<EvDbView<TState>> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
    const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

    const loaded = await storageAdapter.getSnapshotAsync(viewAddress, maxOffset);
    const snapshot =
      maxOffset !== undefined && loaded.offset > maxOffset
        ? EvDbStoredSnapshotResultRaw.Empty
        : loaded;

    return new GenericView<TState, TEventMap>(
      viewAddress,
      storageAdapter,
      snapshot as unknown as EvDbStoredSnapshotResult<TState>,
      this.config,
    );
  }
}

/**
 * Factory function to create a ViewFactory
 */
export function createViewFactory<TState, TEventMap extends Record<string, object>>(
  config: ViewConfig<TState, TEventMap>,
): ViewFactory<TState, TEventMap> {
  return new ViewFactory(config);
}

export type { EvDbStreamEventHandlersMap, ViewConfig } from "./EvDbViewFactoryTypes.js";
