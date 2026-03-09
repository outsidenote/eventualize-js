import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType";

/**
 * Handler function type for applying an event to state.
 * TPayload is the raw event payload POCO (no eventType required).
 * The optional metadata (event metadata without payload) is available as the third argument.
 */
export type EvDbViewEventHandler<TState, TPayload> = (
  oldState: TState,
  event: TPayload,
  metadata: IEvDbEventMetadata,
) => TState;

/**
 * Map of event handlers keyed by eventType string.
 * Handler authors declare their own specific payload types per handler function.
 * The map is Partial so views only need handlers for events they care about.
 *
 * The event parameter is typed as `never` in the stored function signature to allow
 * any specific payload type to be assigned here (since function parameters are
 * contravariant — a handler accepting a specific type is assignable when the
 * stored signature accepts `never`, because `never` is the bottom type).
 * At runtime, `GenericView.handleOnApply` casts the payload appropriately.
 */
export type EvDbStreamEventHandlersMap<TState, TEvents extends IEvDbEventType = never> = Partial<
  Record<TEvents["eventType"], EvDbViewEventHandler<TState, TEvents>>
>;

/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends IEvDbEventType> {
  viewName: string;
  streamType: string;
  defaultState: TState;
  handlers: EvDbStreamEventHandlersMap<TState, TEvents>;
  /** Optional single catch-all handler — called for every event when present, overrides handlers map. */
  singleHandler?: (state: TState, payload: unknown, meta: IEvDbEventMetadata) => TState;
}
