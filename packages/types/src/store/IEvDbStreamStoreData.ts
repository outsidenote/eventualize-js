import type EvDbStreamAddress from "../stream/EvDbStreamAddress.js";
import type ImmutableIEvDbView from "./ImmutableIEvDbView.js";
import type { ImmutableIEvDbViewMap } from "./ImmutableIEvDbViewMap.js";
import type EvDbEvent from "../events/EvDbEvent.js";
import type EvDbMessage from "../messages/EvDbMessage.js";

export default interface IEvDbStreamStoreData {
  /** Serialization options (optional) */
  options?: Record<string, any>; // JsonSerializerOptions equivalent in TS

  /** Views (unspecialized) */
  getViews: () => ImmutableIEvDbViewMap;

  getView(viewName: string): ImmutableIEvDbView | undefined;

  /** Unspecialized events */
  getEvents: () => ReadonlyArray<EvDbEvent>;

  /** Unspecialized notifications */
  getMessages: () => ReadonlyArray<EvDbMessage>;

  /** Stream address (uniqueness) */
  streamAddress: EvDbStreamAddress;
}
