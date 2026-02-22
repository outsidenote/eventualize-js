import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";
import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type { ViewFactory } from "./EvDbViewFactory.js";

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<
  TEvents extends IEvDbEventPayload,
  TStreamType extends string,
> {
  streamType: TStreamType;
  viewFactories: ViewFactory<any, TEvents>[];
  eventTypes: EventTypeConfig<TEvents>[];
  viewNames: string[]; // Track view names for accessor creation
}

/**
 * Configuration for each event type
 */
export interface EventTypeConfig<TEvent extends IEvDbEventPayload> {
  eventClass: new (...args: any[]) => TEvent;
  eventName: string;
  eventMessagesProducer?: EVDbMessagesProducer;
}
