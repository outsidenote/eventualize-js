import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EVDbMessagesProducer from '@eventualize/types/EvDbMessagesProducer';

import EvDbStream from './EvDbStream.js';
import { EvDbView } from './EvDbView.js';
import { ViewFactory, createViewFactory, EvDbStreamEventHandlersMap } from './EvDbViewFactory.js';
import EvDbEvent from '@eventualize/types/EvDbEvent.js';

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  streamType: TStreamType;
  viewFactories: ViewFactory<any, TEvents>[];
  eventTypes: EventTypeConfig<TEvents>[];
  viewNames: string[]; // Track view names for accessor creation
}

/**
 * Configuration for each event type
 */
export interface EventTypeConfig<
  TEvent extends IEvDbEventPayload,
> {
  eventClass: new (...args: any[]) => TEvent;
  eventName: string;
  eventMessagesProducer?: EVDbMessagesProducer;
}

/**
 * Type helper to extract event methods
 */
type EventMethods<TEvents extends IEvDbEventPayload> = {
  [K in TEvents as `appendEvent${K['payloadType']}`]: (event: K) => Promise<void>;
};

/**
 * Type helper to create view accessors map
 */
type ViewAccessors<TViews extends Record<string, EvDbView<any>>> = {
  readonly views: TViews;
};

/**
 * Combined stream type with event methods and view accessors
 */
export type StreamWithEventMethods<TEvents extends IEvDbEventPayload, TViews extends Record<string, EvDbView<any>> = {}> =
  EvDbStream & EventMethods<TEvents> & ViewAccessors<TViews>;

/**
 * Stream Factory - creates stream instances with configured views and dynamic event methods
 */
export class EvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string, TViews extends Record<string, EvDbView<any>> = {}> {
  private DynamicStreamClass: new (
    streamType: string,
    views: EvDbView<any>[],
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    streamId: string,
    lastStreamOffset: number,
  ) => StreamWithEventMethods<TEvents, TViews>;

  constructor(private readonly config: EvDbStreamFactoryConfig<TEvents, TStreamType>) {
    this.DynamicStreamClass = this.createDynamicStreamClass();
  }

  /**
   * Creates a dynamic stream class with event-specific methods and view accessors
   */
  private createDynamicStreamClass() {
    const eventTypes = this.config.eventTypes;
    const viewNames = this.config.viewNames;

    const messagesProducer: EVDbMessagesProducer = (event: EvDbEvent, viewsState: Readonly<Record<string, unknown>>) => {
      const eventType = eventTypes.find(e => e.eventName === event.eventType);
      if (!eventType || !eventType.eventMessagesProducer) return [];
      return eventType.eventMessagesProducer(event, viewsState);
    }

    class DynamicStream extends EvDbStream {
      public readonly views: Record<string, EvDbView<any>> = {};

      constructor(
        streamType: string,
        views: EvDbView<any>[],
        streamStorageAdapter: IEvDbStorageStreamAdapter,
        streamId: string,
        lastStreamOffset: number,
      ) {
        super(streamType, views, streamStorageAdapter, streamId, lastStreamOffset, messagesProducer);

        // Create view accessors
        views.forEach((view, index) => {
          const viewName = viewNames[index];
          if (viewName) {
            this.views[viewName] = view;
          }
        });
      }
    }

    // Add dynamic methods for each event type
    eventTypes.forEach(({ eventName }) => {
      const methodName = `appendEvent${eventName}`;
      (DynamicStream.prototype as any)[methodName] = async function (event: IEvDbEventPayload) {
        return this.appendEvent(event);
      };
    });

    return DynamicStream as any;
  }

  /**
   * Creates a stream instance with all configured views and dynamic event methods
   */
  public create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
    lastStreamOffset: number = 0
  ): StreamWithEventMethods<TEvents, TViews> {
    const views = this.createViews(streamId, snapshotStorageAdapter);

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      lastStreamOffset,
    );
  }

  private createViews(streamId: string, snapshotStorageAdapter: IEvDbStorageSnapshotAdapter): Array<EvDbView<any>> {
    const views = this.config.viewFactories.map(factory =>
      factory.create(streamId, snapshotStorageAdapter)
    );
    return views;
  }

  private getViews(streamId: string, snapshotStorageAdapter: IEvDbStorageSnapshotAdapter): Promise<EvDbView<any>>[] {
    const getViewPromises = this.config.viewFactories.map(viewFactory =>
      viewFactory.get(streamId, snapshotStorageAdapter)
    );
    return getViewPromises;
  }

  /**
   * Fetches from storage a stream instance with all configured views and dynamic event methods
   */
  public async get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter
  ): Promise<StreamWithEventMethods<TEvents, TViews>> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);

    const views = await Promise.all(this.getViews(streamId, snapshotStorageAdapter));

    if (!views.length) {
      const lastStreamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress);
      const stream = this.create(streamId, streamStorageAdapter, snapshotStorageAdapter, lastStreamOffset);
      return stream;
    }

    const lowestViewOffset = views.reduce((lowestOffset: number, currentView: EvDbView<any>) =>
      Math.min(lowestOffset, currentView.storeOffset),
      Number.MAX_VALUE
    );

    const streamCursor = new EvDbStreamCursor(streamAddress, lowestViewOffset + 1);
    const events = await streamStorageAdapter.getEventsAsync(streamCursor);

    let streamOffset = lowestViewOffset;
    for await (const event of events) {
      views.forEach(view => view.applyEvent(event));
      streamOffset = event.streamCursor.offset;
    }

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      streamOffset
    );
  }

  public getStreamType(): TStreamType {
    return this.config.streamType;
  }
}

/**
 * Factory function to create a StreamFactory
 */
export function createEvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string, TViews extends Record<string, EvDbView<any>> = {}>(
  config: EvDbStreamFactoryConfig<TEvents, TStreamType>
): EvDbStreamFactory<TEvents, TStreamType, TViews> {
  return new EvDbStreamFactory(config);
}

/**
 * Fluent builder for creating stream factories with inferred event types
 */
export class StreamFactoryBuilder<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload = never,
  TViews extends Record<string, EvDbView<any>> = {}
> {
  private viewFactories: ViewFactory<any, TEvents>[] = [];
  private eventTypes: EventTypeConfig<any>[] = [];
  private viewNames: string[] = [];

  constructor(private streamType: TStreamType) { }

  /**
   * Register event type for dynamic method generation - infers the event name from class name
   */
  withEventType<TEvent extends IEvDbEventPayload>(
    eventClass: new (...args: any[]) => TEvent,
    eventMessagesProducer?: EVDbMessagesProducer): StreamFactoryBuilder<
      TStreamType,
      TEvents | TEvent,
      TViews
    > {
    // Use the class name as the event name
    const eventName = eventClass.name;

    this.eventTypes.push({ eventClass, eventName, eventMessagesProducer } as EventTypeConfig<TEvent>);
    return this as any;
  }

  /**
   * Add a view with inline handler definition
   * This can only be called AFTER withEventType calls to ensure type safety
   */
  public withView<TViewName extends string, TState>(
    viewName: TViewName,
    stateClass: new (...args: any[]) => TState,
    handlers: EvDbStreamEventHandlersMap<TState, TEvents>
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    // Create default state instance
    const defaultState = new stateClass();

    // Create the view factory
    const viewFactory = createViewFactory<TState, TEvents>({
      viewName,
      streamType: this.streamType,
      defaultState,
      handlers
    });

    this.viewFactories.push(viewFactory);
    this.viewNames.push(viewName);
    return this as any;
  }

  /**
   * Add a pre-created view factory (legacy support)
   */
  public withViewFactory<TViewName extends string, TState>(
    viewName: TViewName,
    viewFactory: ViewFactory<TState, TEvents>
  ): StreamFactoryBuilder<TStreamType, TEvents, TViews & Record<TViewName, EvDbView<TState>>> {
    this.viewFactories.push(viewFactory);
    this.viewNames.push(viewName);
    return this as any;
  }

  /**
   * Build the stream factory
   */
  public build() {
    const factory = new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      eventTypes: this.eventTypes,
      viewNames: this.viewNames
    }) as EvDbStreamFactory<TEvents, TStreamType, TViews>;

    // Return factory with type helper for stream type extraction
    return Object.assign(factory, {
      // This is a type-only property for extracting the stream type
      StreamType: null as unknown as StreamWithEventMethods<TEvents, TViews>
    });
  }
}
