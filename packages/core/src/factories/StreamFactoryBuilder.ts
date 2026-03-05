import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { EvDbView } from "../view/EvDbView.js";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

/** Maps view names to their state types (not view objects). */
type TypedViewStates<TViews extends Record<string, EvDbView<unknown>>> = {
  [K in keyof TViews]: TViews[K] extends EvDbView<infer S> ? S : never;
};

/**
 * The per-event factory methods on MessageFactoryBuilder.
 * One `add${EventName}(messageType, factory)` method per registered event.
 */
type MessageFactoryMethods<
  TStreamType extends string,
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> = {
  readonly [K: `add${string}`]: (
    messageType: string,
    factory: (
      payload: IEvDbPayloadData,
      views: TypedViewStates<TViews>,
      meta: IEvDbEventMetadata,
    ) => unknown,
  ) => FullMessageFactoryBuilder<TStreamType, TEvents, TViews>;
};

/** MessageFactoryBuilder augmented with the per-event typed methods. */
type FullMessageFactoryBuilder<
  TStreamType extends string,
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> = MessageFactoryBuilder<TStreamType, TEvents, TViews> &
  MessageFactoryMethods<TStreamType, TEvents, TViews>;

// ---------------------------------------------------------------------------
// Internal helper: build the FullMessageFactoryBuilder for a given set of arrays
// ---------------------------------------------------------------------------

function buildMessageBuilder<
  TStreamType extends string,
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
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
// ViewBuilder
// ---------------------------------------------------------------------------

/**
 * Builder returned by StreamFactoryBuilder.withViews().
 * Exposes addView() (repeatable) then withMessages() or build().
 * Does NOT expose withEvent().
 */
class ViewBuilder<
  TStreamType extends string,
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> {
  constructor(
    private readonly streamType: TStreamType,
    private readonly viewFactories: ViewFactory<unknown, TEvents>[],
    private readonly eventTypes: EventTypeConfig[],
    private readonly viewNames: string[],
  ) {}

  /**
   * Add a view with a single catch-all handler.
   * Handler signature: (state, payload, meta) => state
   * Returns this for chaining.
   */
  public addView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handler: (state: TState, payload: unknown, meta: IEvDbEventMetadata) => TState,
  ): ViewBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers: {},
      singleHandler: handler,
    });

    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEvents>);
    this.viewNames.push(viewName);
    return this as unknown as ViewBuilder<
      TStreamType,
      TEvents,
      TViews & Record<TViewName, EvDbView<TState>>
    >;
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
 * TViews      — record of registered view name → EvDbView instances
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends { readonly eventType: string } = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
> {
  private viewFactories: ViewFactory<unknown, TEvents>[] = [];
  private eventTypes: EventTypeConfig[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) {}

  /**
   * Register a POCO event type by explicit name.
   * Callers supply one explicit type arg: `withEvent<MyPayload>("MyEventName")`.
   */
  withEvent<T extends object>(
    eventType: string,
  ): StreamFactoryBuilder<TStreamType, TEvents | (T & { readonly eventType: string }), TViews> {
    this.eventTypes.push({ eventName: eventType, eventMessagesProducers: [] });
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents | (T & { readonly eventType: string }),
      TViews
    >;
  }

  /**
   * Enter the views phase. Returns a ViewBuilder that exposes addView().
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
   * Add a view with inline handler map definition (deprecated — prefer withViews().addView()).
   * Must be called after all withEvent calls to ensure type safety.
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers,
    });

    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEvents>);
    this.viewNames.push(viewName);
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents,
      TViews & Record<TViewName, EvDbView<TState>>
    >;
  }

  /**
   * Seals TEvents + TViews and returns a MessageFactoryBuilder whose instance
   * carries one method per registered event: add<EventName>(messageType, factory).
   *
   * Must be called after all withView()/withViews() calls so TViews is fully resolved.
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
  TEvents extends { readonly eventType: string },
  TViews extends Record<string, EvDbView<unknown>>,
> {
  constructor(
    private readonly streamType: TStreamType,
    private readonly viewFactories: ViewFactory<unknown, TEvents>[],
    readonly eventTypes: EventTypeConfig[],
    private readonly viewNames: string[],
  ) {}

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
