import EvDbStream from '@eventualize/types/EvDbStream';
import IEvDbStorageSnapshotAdapter from '@eventualize/types/IEvDbStorageSnapshotAdapter';
import IEvDbStorageStreamAdapter from '@eventualize/types/IEvDbStorageStreamAdapter';
import IEvDbEventPayload from "@eventualize/types/IEvDbEventPayload";
import { ViewFactory } from './ViewFactory.js';
import { EvDbView } from './EvDbView.js';
import EvDbStreamCursor from '@eventualize/types/EvDbStreamCursor';
import EvDbStreamAddress from '@eventualize/types/EvDbStreamAddress';

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  streamType: TStreamType;
  viewFactories: ViewFactory<any, TEvents>[];
}

/**
 * Stream Factory - creates stream instances with configured views
 */
export class EvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  constructor(private readonly config: EvDbStreamFactoryConfig<TEvents, TStreamType>) { }

  /**
   * Creates a stream instance with all configured views
   */
  public create(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter,
    lastStreamOffset: number = 0
  ): EvDbStream {
    // Create all views using their factories
    const views = this.createViews(streamId, snapshotStorageAdapter);

    return new EvDbStream(
      this.config.streamType,
      views,
      streamStorageAdapter,
      streamId,
      lastStreamOffset
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
   * Fetches from storage a stream instance with all configured views
   */
  public async get(
    streamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter: IEvDbStorageSnapshotAdapter
  ): Promise<EvDbStream> {

    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);

    const views = await Promise.all(this.getViews(streamId, snapshotStorageAdapter));

    if (!views.length) {
      const lastStreamOffset = await streamStorageAdapter.getLastOffsetAsync(streamAddress)
      const stream = this.create(streamId, streamStorageAdapter, snapshotStorageAdapter, lastStreamOffset);
      return stream;
    }

    const lowestViewOffset = views.reduce((lowestOffset: number, currentView: EvDbView<any>) =>
      Math.min(lowestOffset, currentView.storeOffset)
      , 0)

    const streamCursor = new EvDbStreamCursor(streamAddress, lowestViewOffset + 1);
    const events = await streamStorageAdapter.getEventsAsync(streamCursor);

    let streamOffset = lowestViewOffset;
    for await (const event of events) {
      views.forEach(view => view.applyEvent(event));
      streamOffset = event.streamCursor.offset;
    }

    return new EvDbStream(
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
export function createEvDbStreamFactory<TEvents extends IEvDbEventPayload, TStreamType extends string>(
  config: EvDbStreamFactoryConfig<TEvents, TStreamType>
): EvDbStreamFactory<TEvents, TStreamType> {
  return new EvDbStreamFactory(config);
}

/**
 * Fluent builder for creating stream factories
 */
export class StreamFactoryBuilder<TEvents extends IEvDbEventPayload, TStreamType extends string> {
  private streamType: TStreamType;
  private viewFactories: ViewFactory<any, TEvents>[] = [];

  constructor(streamType: TStreamType) {
    this.streamType = streamType;
  }

  /**
   * Add a view factory to the stream
   */
  public withView<TState>(viewFactory: ViewFactory<TState, TEvents>): this {
    this.viewFactories.push(viewFactory);
    return this;
  }

  /**
   * Add multiple view factories at once
   */
  public withViews(...viewFactories: ViewFactory<any, TEvents>[]): this {
    this.viewFactories.push(...viewFactories);
    return this;
  }

  /**
   * Build the stream factory
   */
  public build(): EvDbStreamFactory<TEvents, TStreamType> {
    return new EvDbStreamFactory({
      streamType: this.streamType,
      viewFactories: this.viewFactories
    });
  }
}

