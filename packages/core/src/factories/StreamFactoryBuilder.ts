import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import type { StreamWithEventMethods } from "./EvDbStreamFactory.js";
import type { EventTypeConfig } from "./EvDbStreamFactoryTypes.js"; // used by withEventType
import type { ViewFactory, EvDbStreamEventHandlersMap } from "./EvDbViewFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { EvDbView } from "../view/EvDbView.js";

/**
 * Opaque token carrying T (event data shape) and TEventName (literal string) at the type level,
 * with the event name as its runtime string value.
 */
export type EvtToken<T extends object, TEventName extends string> = TEventName & {
  readonly __evtBrand: T;
};

/**
 * Creates a typed event token. T is the event data shape; TEventName is inferred from the value.
 * Both type args can be explicit, or only T — TEventName is always inferred from the name argument.
 *
 * Usage: evt<FundsCaptured, FundsEventNames.FundsCaptured>(FundsEventNames.FundsCaptured)
 *    or: evt<FundsCaptured>(FundsEventNames.FundsCaptured)   ← TEventName inferred
 */
export function evt<T extends object, TEventName extends string>(
  name: TEventName,
): EvtToken<T, TEventName> {
  return name as EvtToken<T, TEventName>;
}

/**
 * Fluent builder for creating stream factories with inferred event types
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
> {
  private viewFactories: ViewFactory<unknown, TEvents>[] = [];
  private eventTypes: EventTypeConfig[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) { }


  /**
   * Register a POCO event type by explicit name. T is the event's data shape (a plain type alias).
   * TEventName captures the string literal so downstream types remain fully typed.
   */
  withEvent<T extends object>(
    payloadType: string
  ): StreamFactoryBuilder<
    TStreamType,
    T & { readonly payloadType: string },
    TViews
  > {
    this.eventTypes.push({ eventName: payloadType });
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents | (T & { readonly payloadType: string }),
      TViews
    >;
  }

  /**
   * Register a POCO event type by explicit name. T is the event's data shape (a plain type alias).
   * TEventName captures the string literal so downstream types remain fully typed.
   */
  withEventType<T extends object, TEventName extends string>(
    payloadType: TEventName,
    eventMessagesProducer?: EVDbMessagesProducer,
  ): StreamFactoryBuilder<
    TStreamType,
    TEvents | (T & { readonly payloadType: TEventName }),
    TViews
  > {
    this.eventTypes.push({ eventName: payloadType, eventMessagesProducer });
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents | (T & { readonly payloadType: TEventName }),
      TViews
    >;
  }

  /**
   * Add a view with inline handler definition
   * This can only be called AFTER withEventType calls to ensure type safety
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    defaultState: TState,
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    // Create the view factory
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
   * Add a pre-created view factory (legacy support)
   */
  public withViewFactory<TViewName extends string, TState>(
    viewName: TViewName,
    viewFactory: ViewFactory<TState, TEvents>,
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    this.viewFactories.push(viewFactory as unknown as ViewFactory<unknown, TEvents>);
    this.viewNames.push(viewName);
    return this as unknown as StreamFactoryBuilder<
      TStreamType,
      TEvents,
      TViews & Record<TViewName, EvDbView<TState>>
    >;
  }

  /**
   * Build the stream factory using event types registered via `withEventType`.
   */
  public build(): EvDbStreamFactory<TEvents, TStreamType, TViews> & {
    StreamType: StreamWithEventMethods<TEvents, TViews>;
  } {
    const factory = new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      eventTypes: this.eventTypes,
      viewNames: this.viewNames,
    }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

    // Return factory with type helper for stream type extraction
    return Object.assign(factory, {
      // This is a type-only property for extracting the stream type
      StreamType: null as unknown as StreamWithEventMethods<TEvents, TViews>,
    });
  }
}
