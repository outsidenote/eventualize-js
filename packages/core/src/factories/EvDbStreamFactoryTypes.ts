import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type { ViewFactory } from "./EvDbViewFactory.js";
import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType.js";

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<
  TEvents extends IEvDbEventType,
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
  eventMessagesProducers: EVDbMessagesProducer[];
}
