import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType.js";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/**
 * Flattens an intersection type into a plain object type.
 * Simplify<{A: PA} & {B: PB}> = {A: PA, B: PB}
 * This ensures indexed access TEventMap[K] returns the per-event payload, not an intersection.
 */
type Simplify<T> = { [K in keyof T]: T[K] };

/**
 * Map of handlers keyed by registered event type literals.
 * Keys are derived from TEvents["eventType"] — only registered event names are valid.
 */
type EventHandlersMap<TEvents extends IEvDbEventType, TState> = Partial<
  Record<TEvents["eventType"], (state: TState, payload: never, meta: IEvDbEventMetadata) => TState>
>;

/**
 * The per-event factory methods on MessageFactoryBuilder.
 * One `add${EventName}(messageType, factory)` method per registered event.
 * Payload is typed per-event via TEventMap — no cast needed at the call site.
 * TViews maps view names to their state values directly.
 */
type MessageFactoryMethods<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
  TEventMap extends Record<string, object>,
> = {
    readonly [K in string & keyof TEventMap as `add${K}`]: (
      messageType: string,
      factory: (payload: TEventMap[K], views: TViews, meta: IEvDbEventMetadata) => unknown,
    ) => FullMessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap>;
  };

/** MessageFactoryBuilder augmented with the per-event typed methods. */
type FullMessageFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
  TEventMap extends Record<string, object>,
> = MessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap> &
  MessageFactoryMethods<TStreamType, TEvents, TViews, TEventMap>;

// ---------------------------------------------------------------------------
// Internal helper: build the FullMessageFactoryBuilder for a given set of arrays
// ---------------------------------------------------------------------------

function buildMessageBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
  TEventMap extends Record<string, object>,
>(
  streamType: TStreamType,
  viewFactories: ViewFactory<unknown, TEvents>[],
  eventTypes: EventTypeConfig[],
  viewNames: string[],
): FullMessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap> {
  const builder = new MessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap>(
    streamType,
    viewFactories,
    eventTypes,
    viewNames,
  );

  // Inject one method per registered event onto this specific instance.
  // Using instance assignment (not prototype mutation) avoids cross-builder
  // interference when multiple stream factories are built in the same process.
  const instance = builder as unknown as Record<string, unknown>;

  for (const { eventName } of eventTypes) {
    const capturedName = eventName;
    instance[`add${capturedName}`] = function (
      this: void,
      messageType: string,
      factory: (payload: unknown, viewStates: unknown, meta: IEvDbEventMetadata) => unknown,
    ): FullMessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap> {
      const producer: EVDbMessagesProducer = (event, viewStates) => {
        if (event.eventType !== capturedName) return [];
        const payload = factory(event.payload as unknown, viewStates, event);
        if (payload === undefined) return [];
        return [EvDbMessage.createFromEvent(event, messageType, payload)];
      };
      const config = builder.eventTypes.find((e) => e.eventName === capturedName);
      if (config) config.eventMessagesProducers.push(producer);
      return builder as unknown as FullMessageFactoryBuilder<
        TStreamType,
        TEvents,
        TViews,
        TEventMap
      >;
    };
  }

  return builder as unknown as FullMessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap>;
}

// ---------------------------------------------------------------------------
// ViewHandlerBuilder — fluent per-event handler registration
// ---------------------------------------------------------------------------

/**
 * Type surface for the per-event `from<EventName>` methods injected at runtime.
 * One method per registered event; each accepts a handler (state, payload, meta) => state.
 * Payload is typed `never` here — callers annotate the payload type explicitly.
 * Keys are derived from TEvents["eventType"] so only registered event names are valid.
 */
type FromEventMethods<TState, TEvents extends IEvDbEventType> = {
  readonly [E in TEvents as `from${E["eventType"]}`]: (
    handler: (state: TState, payload: never, meta: IEvDbEventMetadata) => TState,
  ) => FullViewHandlerBuilder<TState, TEvents>;
};

/** ViewHandlerBuilder augmented with the per-event `from<EventName>` typed methods. */
type FullViewHandlerBuilder<TState, TEvents extends IEvDbEventType> = ViewHandlerBuilder<
  TState,
  TEvents
> &
  FromEventMethods<TState, TEvents>;

/**
 * Fluent builder for per-event view handlers.
 * Used inside addViewBuilder().
 * Per-event methods (fromPointsAdded, etc.) are injected onto each instance at construction time.
 */
class ViewHandlerBuilder<TState, TEvents extends IEvDbEventType> {
  readonly handlers: EvDbStreamEventHandlersMap<TState, TEvents> = {};
}

/**
 * Tagged wrapper for use with addViewBuilder().
 * Use the `fromEvents()` helper to create one.
 */
class ViewHandlerBuilderCallback<TState, TEvents extends IEvDbEventType> {
  constructor(
    readonly fn: (
      builder: FullViewHandlerBuilder<TState, TEvents>,
    ) => FullViewHandlerBuilder<TState, TEvents>,
  ) { }
}

/**
 * Wraps a per-event builder callback for use with addViewBuilder().
 * @example
 *   .addViewBuilder("balance", 0, fromEvents(b => b
 *     .fromDeposited((s, e: Deposited) => s + e.amount)
 *     .fromWithdrawn((s, e: Withdrawn) => s - e.amount)
 *   ))
 */
export function fromEvents<TState, TEvents extends IEvDbEventType>(
  fn: (builder: FullViewHandlerBuilder<TState, TEvents>) => FullViewHandlerBuilder<TState, TEvents>,
): ViewHandlerBuilderCallback<TState, TEvents> {
  return new ViewHandlerBuilderCallback(fn);
}

/**
 * Constructs a FullViewHandlerBuilder with `from<EventName>` methods injected per registered event.
 */
function buildViewHandlerBuilder<TState, TEvents extends IEvDbEventType>(
  eventTypes: EventTypeConfig[],
): FullViewHandlerBuilder<TState, TEvents> {
  const builder = new ViewHandlerBuilder<TState, TEvents>();
  const instance = builder as unknown as Record<string, unknown>;

  for (const { eventName } of eventTypes) {
    const capturedName = eventName;
    instance[`from${capturedName}`] = function (
      handler: (state: TState, payload: never, meta: IEvDbEventMetadata) => TState,
    ): FullViewHandlerBuilder<TState, TEvents> {
      (builder.handlers as Record<string, unknown>)[capturedName] = handler;
      return builder as unknown as FullViewHandlerBuilder<TState, TEvents>;
    };
  }

  return builder as unknown as FullViewHandlerBuilder<TState, TEvents>;
}

// ---------------------------------------------------------------------------
// ViewBuilder
// ---------------------------------------------------------------------------

/**
 * Builder returned by StreamFactoryBuilder.withViews().
 * Exposes addView(), addViewPattern(), addViewBuilder() (repeatable) then withMessages() or build().
 * Does NOT expose withEvent().
 * TViews accumulates Record<viewName, stateType> — state values, not EvDbView wrappers.
 */

class ViewBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
  TEventMap extends Record<string, object> = Record<never, never>,
> {
  constructor(
    private readonly streamType: TStreamType,
    private readonly viewFactories: ViewFactory<unknown, TEvents>[],
    private readonly eventTypes: EventTypeConfig[],
    private readonly viewNames: string[],
  ) { }

  private _registerView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>,
    singleHandler?: (state: TState, payload: unknown, meta: IEvDbEventMetadata) => TState,
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>, TEventMap> {
    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers,
      singleHandler,
    });
    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEvents>);
    this.viewNames.push(viewName);
    return this as unknown as ViewBuilder<
      TStreamType,
      TEvents,
      TViews & Record<TViewName, TState>,
      TEventMap
    >;
  }

  /**
   * Add a view with a single catch-all handler.
   * Handler signature: (state, payload, meta) => state
   * All events are passed to this one handler.
   */
  public addView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handler: (state: TState, payload: TEvents, meta: IEvDbEventMetadata) => TState,
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>, TEventMap> {
    return this._registerView(
      viewName,
      defaultState,
      {},
      handler as (state: TState, payload: unknown, meta: IEvDbEventMetadata) => TState,
    );
  }

  /**
   * Add a view with a per-event handlers map (pattern-matching style).
   * Keys are event type strings; values are handler functions for that event.
   * Unhandled events return the state unchanged.
   */
  public addViewPattern<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: EventHandlersMap<TEvents, TState>,
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>, TEventMap> {
    return this._registerView(
      viewName,
      defaultState,
      handlers as unknown as EvDbStreamEventHandlersMap<TState, TEvents>,
    );
  }

  /**
   * Add a view with a fluent per-event builder callback.
   * The callback receives a builder with one `from<EventName>(handler)` method per registered event.
   * Chain as many as needed; unhandled events return state unchanged.
   * Accepts either a raw callback `(b) => b.fromX(...)` or a `fromEvents(...)` wrapped callback.
   */
  public addViewBuilder<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    builderCallback:
      | ViewHandlerBuilderCallback<TState, TEvents>
      | ((
        builder: FullViewHandlerBuilder<TState, TEvents>,
      ) => FullViewHandlerBuilder<TState, TEvents>),
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>, TEventMap> {
    const vhb = buildViewHandlerBuilder<TState, TEvents>(this.eventTypes);
    let result: ViewHandlerBuilder<TState, TEvents>;
    if (builderCallback instanceof ViewHandlerBuilderCallback) {
      result = builderCallback.fn(vhb);
    } else {
      result = builderCallback(vhb);
    }
    return this._registerView(
      viewName,
      defaultState,
      result.handlers as EvDbStreamEventHandlersMap<TState, TEvents>,
    );
  }

  /**
   * Seals TEvents + TViews and returns a MessageFactoryBuilder.
   */
  public withMessages(): FullMessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap> {
    return buildMessageBuilder<TStreamType, TEvents, TViews, TEventMap>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );
  }

  /**
   * Build the stream factory.
   */
  public build() {
    return buildFactory<TEvents, TStreamType, TViews>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );
  }
}

// ---------------------------------------------------------------------------
// StreamFactoryBuilder (EventBuilder phase)
// ---------------------------------------------------------------------------

/**
 * Fluent builder for creating stream factories with inferred event types.
 *
 * TStreamType — string literal type of the stream name
 * TEvents     — union of registered event shapes for view handlers and factory internals
 * TViews      — record of registered view name → state type (values exposed directly on stream.views)
 * TEventMap   — map of event name literals to raw payload types (for per-event message factories)
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType = never,
  TViews extends Record<string, unknown> = {},
  TEventMap extends Record<string, object> = Record<never, never>,
> {
  private viewFactories: ViewFactory<unknown, TEvents>[] = [];
  private eventTypes: EventTypeConfig[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) { }

  /**
   * Register a POCO event type by explicit name.
   * Callers supply one explicit type arg: `withEvent<MyPayload>("MyEventName")`.
   */
  public withEvent<T extends object, E extends string = string>(
    eventType: E,
  ): StreamFactoryBuilder<
    TStreamType,
    TEvents | (T & { readonly eventType: E }),
    TViews,
    Simplify<TEventMap & Record<E, T>>
  > {
    this.eventTypes.push({ eventName: eventType, eventMessagesProducers: [] });
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents | (T & { readonly eventType: E }),
      TViews,
      Simplify<TEventMap & Record<E, T>>
    >;
  }

  /**
   * Enter the views phase. Returns a ViewBuilder that exposes addView().
   * ViewBuilder does NOT expose withEvent().
   */
  public withViews(): ViewBuilder<TStreamType, TEvents, TViews, TEventMap> {
    return new ViewBuilder<TStreamType, TEvents, TViews, TEventMap>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );
  }

  /**
   * Seals TEvents + TViews and returns a MessageFactoryBuilder whose instance
   * carries one method per registered event: add<EventName>(messageType, factory).
   *
   * Must be called after all withViews() calls so TViews is fully resolved.
   * withMessages() is optional — call build() directly to skip outbox registration.
   */
  public withMessages(): FullMessageFactoryBuilder<TStreamType, TEvents, TViews, TEventMap> {
    return buildMessageBuilder<TStreamType, TEvents, TViews, TEventMap>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );
  }

  /**
   * Build the stream factory.
   * The returned factory's `StreamType` property is a type helper for extracting the stream type,
   * which includes dynamic `appendEvent${EventName}` methods and typed view accessors.
   */
  public build() {
    return buildFactory<TEvents, TStreamType, TViews>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );
  }
}

// ---------------------------------------------------------------------------
// buildFactory — shared helper used by all three build() methods
// ---------------------------------------------------------------------------

function buildFactory<
  TEvents extends IEvDbEventType,
  TStreamType extends string,
  TViews extends Record<string, unknown>,
>(
  streamType: TStreamType,
  viewFactories: ViewFactory<unknown, TEvents>[],
  eventTypes: EventTypeConfig[],
  viewNames: string[],
): EvDbStreamFactory<TEvents, TStreamType, TViews> & {
  StreamType: StreamWithEventMethods<TViews>;
} {
  const factory = new EvDbStreamFactory({
    streamType,
    viewFactories,
    eventTypes,
    viewNames,
  }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

  return Object.assign(factory, {
    StreamType: null as unknown as StreamWithEventMethods<TViews>,
  });
}

// ---------------------------------------------------------------------------
// MessageFactoryBuilder
// ---------------------------------------------------------------------------

/**
 * Builder returned by withMessages().
 * Holds shared mutable state and exposes build().
 * Per-event methods (addPointsAdded, etc.) are injected onto each instance
 * by buildMessageBuilder() at runtime.
 */
class MessageFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
  _TEventMap extends Record<string, object>,
> {
  constructor(
    private readonly streamType: TStreamType,
    private readonly viewFactories: ViewFactory<unknown, TEvents>[],
    readonly eventTypes: EventTypeConfig[],
    private readonly viewNames: string[],
  ) { }

  /**
   * Build the stream factory.
   */
  public build() {
    return buildFactory<TEvents, TStreamType, TViews>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );
  }
}

// Re-export StreamWithEventMethods for consumers
export type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
