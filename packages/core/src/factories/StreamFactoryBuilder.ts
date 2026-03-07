import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
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
 * Strips the { eventType: string } sentinel from each union member of TEvents,
 * recovering the raw payload union. Distributive over union types.
 *
 * TEvents = (PointsAdded & { eventType: string }) | (PointsMultiplied & { eventType: string })
 * ExtractPayload<TEvents> = PointsAdded | PointsMultiplied
 */
type ExtractPayload<T> = T extends IEvDbEventType ? Omit<T, "eventType"> : never;

/**
 * The per-event factory methods on MessageFactoryBuilder.
 * One `add${EventName}(messageType, factory)` method per registered event.
 * TViews maps view names to their state values directly.
 */
type MessageFactoryMethods<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
> = {
  readonly [K: `add${string}`]: (
    messageType: string,
    factory: (payload: IEvDbPayloadData, views: TViews, meta: IEvDbEventMetadata) => unknown,
  ) => FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
};

/** MessageFactoryBuilder augmented with the per-event typed methods. */
type FullMessageFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
> = MessageFactoryBuilder<TStreamType, TEvents, TViews> &
  MessageFactoryMethods<TStreamType, TEvents, TViews>;

// ---------------------------------------------------------------------------
// Internal helper: build the FullMessageFactoryBuilder for a given set of arrays
// ---------------------------------------------------------------------------

function buildMessageBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
>(
  streamType: TStreamType,
  viewFactories: ViewFactory<unknown, TEvents>[],
  eventTypes: EventTypeConfig[],
  viewNames: string[],
): FullMessageFactoryBuilder<TStreamType, TEvents, TViews> {
  const builder = new MessageFactoryBuilder<TStreamType, TEvents, TViews>(
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
      factory: (
        payload: IEvDbPayloadData,
        viewStates: unknown,
        meta: IEvDbEventMetadata,
      ) => unknown,
    ): FullMessageFactoryBuilder<TStreamType, TEvents, TViews> {
      const producer: EVDbMessagesProducer = (event, viewStates) => {
        if (event.eventType !== capturedName) return [];
        const payload = factory(event.payload as IEvDbPayloadData, viewStates, event);
        if (payload === undefined) return [];
        return [EvDbMessage.createFromEvent(event, messageType, payload)];
      };
      const config = builder.eventTypes.find((e) => e.eventName === capturedName);
      if (config) config.eventMessagesProducers.push(producer);
      return builder as unknown as FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
    };
  }

  return builder as unknown as FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
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
type FullViewHandlerBuilder<TState, TEvents extends IEvDbEventType> =
  ViewHandlerBuilder<TState, TEvents> & FromEventMethods<TState, TEvents>;

/**
 * Fluent builder for per-event view handlers.
 * Used inside the builder-callback overload of addViewPattern().
 * Per-event methods (fromPointsAdded, etc.) are injected onto each instance at construction time.
 */
class ViewHandlerBuilder<TState, TEvents extends IEvDbEventType> {
  readonly handlers: EvDbStreamEventHandlersMap<TState, TEvents> = {};
}

/**
 * Tagged wrapper so the addViewPattern implementation can distinguish a builder callback
 * from a plain single catch-all handler without probing the function itself.
 * Use the `fromEvents()` helper to create one.
 */
class ViewHandlerBuilderCallback<TState, TEvents extends IEvDbEventType> {
  constructor(
    readonly fn: (builder: FullViewHandlerBuilder<TState, TEvents>) => FullViewHandlerBuilder<TState, TEvents>,
  ) { }
}

/**
 * Wraps a per-event builder callback for use with addViewPattern().
 * @example
 *   .addViewPattern("balance", 0, fromEvents(b => b
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
 * Exposes addViewPattern() (repeatable) then withMessages() or build().
 * Does NOT expose withEvent().
 * TViews accumulates Record<viewName, stateType> — state values, not EvDbView wrappers.
 */
class ViewBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType,
  TViews extends Record<string, unknown>,
> {
  constructor(
    private readonly streamType: TStreamType,
    private readonly viewFactories: ViewFactory<unknown, TEvents>[],
    private readonly eventTypes: EventTypeConfig[],
    private readonly viewNames: string[],
  ) { }

  /**
   * Add a view with a fluent per-event builder callback.
   * The callback receives a builder with one `from<EventName>(handler)` method per registered event.
   * Chain as many as needed; unhandled events return state unchanged.
   */
  public addView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    builderCallback: ViewHandlerBuilderCallback<TState, TEvents>,
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>>;

  /**
   * Add a view with a per-event handlers map (pattern-matching style).
   * Keys are event type strings; values are handler functions for that event.
   * Unhandled events return the state unchanged.
   */
  public addView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: Partial<
      Record<TEvents["eventType"], (state: TState, payload: never, meta: IEvDbEventMetadata) => TState>
    >,
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>>;

  /**
   * Add a view with a single catch-all handler.
   * Handler signature: (state, payload, meta) => state
   * Returns this for chaining.
   */
  public addView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handler: (state: TState, payload: ExtractPayload<TEvents>, meta: IEvDbEventMetadata) => TState,
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>>;

  public addView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlerOrMapOrCallback:
      | ViewHandlerBuilderCallback<TState, TEvents>
      | Partial<Record<string, (state: TState, payload: never, meta: IEvDbEventMetadata) => TState>>
      | ((state: TState, payload: ExtractPayload<TEvents>, meta: IEvDbEventMetadata) => TState),
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>> {
    let handlers: EvDbStreamEventHandlersMap<TState, TEvents> = {};
    let singleHandler:
      | ((state: TState, payload: unknown, meta: IEvDbEventMetadata) => TState)
      | undefined;

    if (handlerOrMapOrCallback instanceof ViewHandlerBuilderCallback) {
      const vhb = buildViewHandlerBuilder<TState, TEvents>(this.eventTypes);
      const result = handlerOrMapOrCallback.fn(vhb);
      handlers = result.handlers as EvDbStreamEventHandlersMap<TState, TEvents>;
    } else if (typeof handlerOrMapOrCallback === "function") {
      singleHandler = handlerOrMapOrCallback as (
        state: TState,
        payload: unknown,
        meta: IEvDbEventMetadata,
      ) => TState;
    } else {
      handlers = handlerOrMapOrCallback as EvDbStreamEventHandlersMap<TState, TEvents>;
    }

    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers,
      singleHandler,
    });

    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEvents>);
    this.viewNames.push(viewName);
    return this as unknown as ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, TState>>;
  }

  /**
   * Seals TEvents + TViews and returns a MessageFactoryBuilder.
   */
  public withMessages(): FullMessageFactoryBuilder<TStreamType, TEvents, TViews> {
    return buildMessageBuilder<TStreamType, TEvents, TViews>(
      this.streamType,
      this.viewFactories,
      this.eventTypes,
      this.viewNames,
    );
  }

  /**
   * Build the stream factory.
   */
  public build(): EvDbStreamFactory<TEvents, TStreamType, TViews> & {
    StreamType: StreamWithEventMethods<TViews>;
  } {
    const factory = new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      eventTypes: this.eventTypes,
      viewNames: this.viewNames,
    }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

    return Object.assign(factory, {
      StreamType: null as unknown as StreamWithEventMethods<TViews>,
    });
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
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventType = never,
  TViews extends Record<string, unknown> = {},
> {
  private viewFactories: ViewFactory<unknown, TEvents>[] = [];
  private eventTypes: EventTypeConfig[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) { }

  /**
   * Register a POCO event type by explicit name.
   * Callers supply one explicit type arg: `withEvent<MyPayload>("MyEventName")`.
   */
  withEvent<T extends object>(
    eventType: string,
  ): StreamFactoryBuilder<TStreamType, TEvents | (T & IEvDbEventType), TViews> {
    this.eventTypes.push({ eventName: eventType, eventMessagesProducers: [] });
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents | (T & IEvDbEventType),
      TViews
    >;
  }

  /**
   * Enter the views phase. Returns a ViewBuilder that exposes addViewPattern().
   * ViewBuilder does NOT expose withEvent().
   */
  public withViews(): ViewBuilder<TStreamType, TEvents, TViews> {
    return new ViewBuilder<TStreamType, TEvents, TViews>(
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
  public withMessages(): FullMessageFactoryBuilder<TStreamType, TEvents, TViews> {
    return buildMessageBuilder<TStreamType, TEvents, TViews>(
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
  public build(): EvDbStreamFactory<TEvents, TStreamType, TViews> & {
    StreamType: StreamWithEventMethods<TViews>;
  } {
    const factory = new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      eventTypes: this.eventTypes,
      viewNames: this.viewNames,
    }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

    return Object.assign(factory, {
      StreamType: null as unknown as StreamWithEventMethods<TViews>,
    });
  }
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
  public build(): EvDbStreamFactory<TEvents, TStreamType, TViews> & {
    StreamType: StreamWithEventMethods<TViews>;
  } {
    const factory = new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      eventTypes: this.eventTypes,
      viewNames: this.viewNames,
    }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

    return Object.assign(factory, {
      StreamType: null as unknown as StreamWithEventMethods<TViews>,
    });
  }
}

// Re-export StreamWithEventMethods for consumers
export type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
