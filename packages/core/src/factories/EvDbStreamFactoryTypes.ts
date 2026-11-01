import type EVDbMessagesProducer from "@eventualize/types/messages/EvDbMessagesProducer";
import type { EvDbSpanPolicy } from "@eventualize/types/telemetry/EvDbSpanPolicy";
import type { ViewFactory } from "./EvDbViewFactory.js";

/**
 * Configuration for creating a stream factory
 */
export interface EvDbStreamFactoryConfig<
  TEventMap extends Record<string, object>,
  TStreamType extends string,
> {
  streamType: TStreamType;
  viewFactories: ViewFactory<unknown, TEventMap>[];
  eventTypes: EventTypeConfig[];
  viewNames: string[]; // Track view names for accessor creation
  /** Spans this factory's streams produce. Default: `EVDB_DEFAULT_SPANS`. */
  spanPolicy?: EvDbSpanPolicy;
}

/**
 * Configuration for each event type
 */
export interface EventTypeConfig {
  eventName: string;
  eventMessagesProducer?: EVDbMessagesProducer;
}
