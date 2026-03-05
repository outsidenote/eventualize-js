import type EvDbEvent from "@eventualize/types/events/EvDbEvent";

/**
 * Handler function type for applying an event to state.
 * TPayload is the raw event payload POCO (no eventType required).
 * The optional metadata (full EvDbEvent) is available as the third argument.
 */
export type EvDbViewEventHandler<TState, TPayload> = (
  oldState: TState,
  event: TPayload,
  metadata: EvDbEvent,
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
export type EvDbStreamEventHandlersMap<TState, _TEvents = never> = Partial<
  Record<string, EvDbViewEventHandler<TState, never>>
>;

/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends { readonly eventType: string }> {
  viewName: string;
  streamType: string;
  defaultState: TState;
  handlers: EvDbStreamEventHandlersMap<TState, TEvents>;
}
