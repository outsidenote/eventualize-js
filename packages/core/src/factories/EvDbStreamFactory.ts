import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";

import EvDbStream from "../store/EvDbStream.js";
import type { EvDbView } from "../view/EvDbView.js";
import type { EvDbStreamFactoryConfig } from "./EvDbStreamFactoryTypes.js";
import type { IEvDbStreamFactory } from "./IEvDbStreamFactory.js";


/**
 * Type helper to extract event methods from TEventMap
 */
type EventMethods<TEventMap extends Record<string, object>> = {
  [K in string & keyof TEventMap as `appendEvent${K}`]: (
    event: TEventMap[K],
  ) => Promise<void>;
};

/**
 * Type helper to create view accessors map
 */
type ViewAccessors<TViews extends Record<string, unknown>> = {
  readonly views: Readonly<TViews>;
};

/**
 * Combined stream type with event methods and view accessors
 */
export type StreamWithEventMethods<
  TEventMap extends Record<string, object>,
  TViews extends Record<string, unknown> = {},
> = EvDbStream & EventMethods<TEventMap> & ViewAccessors<TViews>;

/**
 * Stream Factory - creates stream instances with configured views and dynamic event methods
 */
export class EvDbStreamFactory<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
> implements IEvDbStreamFactory<TEventMap, TStreamType, TViews> {
  private DynamicStreamClass: new (
    streamType: string,
    views: EvDbView<unknown>[],
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    streamId: string,
    lastStreamOffset: number,
  ) => StreamWithEventMethods<TEventMap, TViews>;

  constructor(private readonly config: EvDbStreamFactoryConfig<TEventMap, TStreamType>) {
    this.DynamicStreamClass = this.createDynamicStreamClass();
  }

  /**
   * Creates a dynamic stream class with event-specific methods and view accessors
   */
  private createDynamicStreamClass() {
    const eventTypes = this.config.eventTypes;
    const viewNames = this.config.viewNames;

    const messagesProducer: EVDbMessagesProducer = (
      event: EvDbEvent,
      viewsState: Readonly<Record<string, unknown>>,
    ) => {
      const eventType = eventTypes.find((e) => e.eventName === event.eventType);
      if (!eventType || !eventType.eventMessagesProducer) return [];
      return eventType.eventMessagesProducer(event, viewsState);
    };

    class DynamicStream extends EvDbStream {
      private readonly _viewMap: Record<string, EvDbView<unknown>> = {};
      public readonly views: Record<string, unknown>;

      constructor(
        streamType: string,
        views: EvDbView<unknown>[],
        streamStorageAdapter: IEvDbStorageStreamAdapter,
        streamId: string,
        lastStreamOffset: number,
      ) {
        super(
          streamType,
          views,
          streamStorageAdapter,
          streamId,
          lastStreamOffset,
          messagesProducer,
        );

        views.forEach((view, index) => {
          const viewName = viewNames[index];
          if (viewName) {
            this._viewMap[viewName] = view;
          }
        });

        this.views = new Proxy(this._viewMap, {
          get(target, prop: string) {
            return target[prop]?.state;
          },
        }) as Record<string, unknown>;
      }
    }

    // Add dynamic methods for each event type
    eventTypes.forEach(({ eventName }) => {
      const methodName = `appendEvent${eventName}`;
      (DynamicStream.prototype as unknown as Record<string, unknown>)[methodName] = async function (
        this: EvDbStream,
        event: Record<string, unknown>,
        capturedBy?: string | null
      ) {
        return this.appendEvent(eventName, event, capturedBy);
      };
    });

    return DynamicStream as unknown as typeof this.DynamicStreamClass;
  }

  /**
   * Creates a stream instance with all configured views and dynamic event methods
   */
  public create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
    lastStreamOffset: number = 0,
  ): StreamWithEventMethods<TEventMap, TViews> {
    const views = snapshotStorageAdapter
      ? this.createViews(streamId, snapshotStorageAdapter)
      : ([] as EvDbView<unknown>[]);

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      lastStreamOffset,
    );
  }

  private createViews(
    streamId: string,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
  ): Array<EvDbView<unknown>> {
    const views = this.config.viewFactories.map((factory) =>
      factory.create(streamId, snapshotStorageAdapter),
    );
    return views;
  }

  private getViews(
    streamId: string,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
  ): Promise<EvDbView<unknown>>[] {
    const getViewPromises = this.config.viewFactories.map((viewFactory) =>
      viewFactory.get(streamId, snapshotStorageAdapter),
    );
    return getViewPromises;
  }

  /**
   * Fetches from storage a stream instance with all configured views and dynamic event methods
   */
  public async get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter | undefined = undefined,
  ): Promise<StreamWithEventMethods<TEventMap, TViews>> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);

    const views = snapshotStorageAdapter
      ? await Promise.all(this.getViews(streamId, snapshotStorageAdapter))
      : [];

    if (!views.length) {
      const lastStreamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress);
      const stream = this.create(
        streamId,
        streamStorageAdapter,
        snapshotStorageAdapter,
        lastStreamOffset,
      );
      return stream;
    }

    const lowestViewOffset = views.reduce(
      (lowestOffset: number, currentView: EvDbView<unknown>) =>
        Math.min(lowestOffset, currentView.storeOffset),
      Number.MAX_VALUE,
    );

    let streamOffset: number;
    if (snapshotStorageAdapter) {
      // lowestViewOffset < 0 means no real snapshot exists yet (empty sentinel = -1).
      // In that case start the cursor at 0 so event at offset 0 is not skipped.
      const fromOffset = lowestViewOffset < 0 ? 0 : lowestViewOffset + 1;
      const streamCursor = new EvDbStreamCursor(streamAddress, fromOffset);
      const events = await streamStorageAdapter.getEventsAsync(streamCursor);

      // Only advance streamOffset from -1 if there is at least one real snapshot.
      streamOffset = lowestViewOffset;
      for await (const event of events) {
        views.forEach((view) => view.applyEvent(event));
        streamOffset = event.streamCursor.offset;
      }
    } else {
      // If no snapshot adapter (no views), we can only get the last offset of the events stream
      streamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress);
    }

    return new this.DynamicStreamClass(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      streamOffset,
    );
  }

  public getStreamType(): TStreamType {
    return this.config.streamType;
  }
}

/**
 * Factory function to create a StreamFactory
 */
export function createEvDbStreamFactory<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
  TViews extends Record<string, unknown> = {},
>(
  config: EvDbStreamFactoryConfig<TEventMap, TStreamType>,
): IEvDbStreamFactory<TEventMap, TStreamType, TViews> {
  return new EvDbStreamFactory(config);
}

export type { EvDbStreamFactoryConfig, EventTypeConfig } from "./EvDbStreamFactoryTypes.js";
