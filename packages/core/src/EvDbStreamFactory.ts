import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';
import EVDbMessagesProducer from '@eventualize/types/EvDbMessagesProducer';

import EvDbStream from './EvDbStream.js';
import { EvDbView } from './EvDbView.js';
import { ViewFactory } from './EvDbViewFactory.js';

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  streamType: TStreamType;
  viewFactories: ViewFactory<any, TEvents>[];
  messagesProducer: EVDbMessagesProducer;
  eventTypes: EventTypeConfig<TEvents>[];
}

/**
 * Configuration for each event type
 */
export interface EventTypeConfig<TEvent extends IEvDbEventPayload> {
  eventClass: new (...args: any[]) => TEvent;
  eventName: string;
}

/**
 * Type helper to extract event methods
 */
type EventMethods<TEvents extends IEvDbEventPayload> = {
  [K in TEvents as `appendEvent${K['payloadType']}`]: (event: K) => Promise<void>;
};

/**
 * Combined stream type with event methods
 */
export type StreamWithEventMethods<TEvents extends IEvDbEventPayload> = EvDbStream & EventMethods<TEvents>;

/**
 * Stream Factory - creates stream instances with configured views and dynamic event methods
 */
export class EvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  private DynamicStreamClass: new (
    streamType: string,
    views: EvDbView<any>[],
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    streamId: string,
    lastStreamOffset: number,
    messagesProducer: EVDbMessagesProducer
  ) => StreamWithEventMethods<TEvents>;

  constructor(private readonly config: EvDbStreamFactoryConfig<TEvents, TStreamType>) {
    this.DynamicStreamClass = this.createDynamicStreamClass();
  }

  /**
   * Creates a dynamic stream class with event-specific methods
   */
  private createDynamicStreamClass() {
    const eventTypes = this.config.eventTypes;

    class DynamicStream extends EvDbStream {
      constructor(
        streamType: string,
        views: EvDbView<any>[],
        streamStorageAdapter: IEvDbStorageStreamAdapter,
        streamId: string,
        lastStreamOffset: number,
        messagesProducer: EVDbMessagesProducer
      ) {
        super(streamType, views, streamStorageAdapter, streamId, lastStreamOffset, messagesProducer);
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
  ): StreamWithEventMethods<TEvents> {
    const views = this.createViews(streamId, snapshotStorageAdapter);

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      lastStreamOffset,
      this.config.messagesProducer
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
  ): Promise<StreamWithEventMethods<TEvents>> {
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
      streamOffset,
      this.config.messagesProducer
    );
  }

  public getStreamType(): TStreamType {
    return this.config.streamType;
  }
}

/**
 * Factory function to create a StreamFactory
 */
export function createEvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string>(
  config: EvDbStreamFactoryConfig<TEvents, TStreamType>
): EvDbStreamFactory<TEvents, TStreamType> {
  return new EvDbStreamFactory(config);
}

/**
 * Fluent builder for creating stream factories with inferred event types
 */
export class StreamFactoryBuilder<TStreamType extends string, TEvents extends IEvDbEventPayload = never> {
  private viewFactories: ViewFactory<any, any>[] = [];
  private eventTypes: EventTypeConfig<any>[] = [];

  constructor(private streamType: TStreamType, private messagesProducer: EVDbMessagesProducer) { }

  /**
   * Add a view factory to the stream
   */
  public withView<TState>(viewFactory: ViewFactory<TState, any>): this {
    this.viewFactories.push(viewFactory);
    return this;
  }

  /**
   * Add multiple view factories at once
   */
  public withViews(...viewFactories: ViewFactory<any, any>[]): this {
    this.viewFactories.push(...viewFactories);
    return this;
  }

  /**
   * Register event type for dynamic method generation - infers the event name from class name
   */
  public withEventType<TEvent extends IEvDbEventPayload>(
    eventClass: new (...args: any[]) => TEvent
  ): StreamFactoryBuilder<TStreamType, TEvents | TEvent> {
    // Use the class name as the event name
    const eventName = eventClass.name;
    
    this.eventTypes.push({ eventClass, eventName } as EventTypeConfig<TEvent>);
    return this as any;
  }

  /**
   * Build the stream factory
   */
  public build(): EvDbStreamFactory<TEvents, TStreamType> {
    return new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories,
      messagesProducer: this.messagesProducer,
      eventTypes: this.eventTypes
    });
  }
}

// ============================================
// Usage Example
// ============================================

// // Define your event types
// interface PointsAdded extends IEvDbEventPayload {
//   payloadType: 'PointsAdded';
//   points: number;
// }

// interface PointsSubtracted extends IEvDbEventPayload {
//   payloadType: 'PointsSubtracted';
//   points: number;
// }

// // Event classes
// class PointsAddedClass implements PointsAdded {
//   payloadType: 'PointsAdded' = 'PointsAdded';
//   constructor(public points: number) {}
// }

// class PointsSubtractedClass implements PointsSubtracted {
//   payloadType: 'PointsSubtracted' = 'PointsSubtracted';
//   constructor(public points: number) {}
// }

// // Usage with builder - NO need to specify PointsEvents union type!
// // TypeScript will infer it from the withEventType calls
// declare const messagesProducer: EVDbMessagesProducer;
// declare const pointsSumViewFactory: ViewFactory<any, any>;
// declare const pointsCountViewFactory: ViewFactory<any, any>;
// declare const streamAdapter: IEvDbStorageStreamAdapter;
// declare const snapshotAdapter: IEvDbStorageSnapshotAdapter;

// const pointsStreamFactory = new StreamFactoryBuilder('PointsStream', messagesProducer)
//   .withView(pointsSumViewFactory)
//   .withView(pointsCountViewFactory)
//   .withEventType(PointsAddedClass)        // No event name needed!
//   .withEventType(PointsSubtractedClass)   // Inferred from class
//   .build();

// // Create stream with dynamic methods
// const stream = pointsStreamFactory.create(
//   'stream1',
//   streamAdapter,
//   snapshotAdapter
// );

// // IDE will recognize these methods!
// // Type: StreamWithEventMethods<PointsAdded | PointsSubtracted>
// await stream.appendEventPointsAdded({ payloadType: 'PointsAdded', points: 50 });
// await stream.appendEventPointsSubtracted({ payloadType: 'PointsSubtracted', points: 20 });