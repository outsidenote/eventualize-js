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
 * TEvents is a union of `{ readonly eventType: K } & payload` shapes.
 * Each handler receives the raw payload (without eventType) plus the full EvDbEvent as metadata.
 */
export type EvDbStreamEventHandlersMap<TState, TEvents extends { readonly eventType: string }> = {
  [K in TEvents["eventType"]]: EvDbViewEventHandler<
    TState,
    Omit<Extract<TEvents, { eventType: K }>, "eventType">
  >;
};

/**
 * Configuration for creating a view
 */
export interface ViewConfig<TState, TEvents extends { readonly eventType: string }> {
  viewName: string;
  streamType: string;
  defaultState: TState;
  handlers: Partial<EvDbStreamEventHandlersMap<TState, TEvents>>;
}
