import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type { ViewFactory } from "./EvDbViewFactory.js";

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<
  TEvents extends { eventType: string },
  TStreamType extends string,
> {
  streamType: TStreamType;
  viewFactories: ViewFactory<unknown, TEvents>[];
  eventTypes: EventTypeConfig[];
  viewNames: string[]; // Track view names for accessor creation
}

/**
 * Configuration for each event type
 */
export interface EventTypeConfig {
  eventName: string;
  eventMessagesProducer?: EVDbMessagesProducer;
}
