import type EvDbStreamAddress from "../stream/EvDbStreamAddress.js";
import type ImmutableIEvDbView from "./ImmutableIEvDbView.js";
import type { ImmutableIEvDbViewMap } from "./ImmutableIEvDbViewMap.js";
import type EvDbEvent from "../events/EvDbEvent.js";
import type EvDbMessage from "../messages/EvDbMessage.js";

/**
 * The data payload passed to a stream store during a save operation.
 * Provides unspecialized (type-erased) access to events, views, and messages
 * so that storage adapters can persist them without knowing concrete payload types.
 */
export default interface IEvDbStreamStoreData {
  /** Optional serialization options forwarded to the underlying storage adapter. */
  options?: Record<string, unknown>; // JsonSerializerOptions equivalent in TS

  /**
   * Returns a read-only map of all views keyed by view name.
   * Views are unspecialized (state typed as `unknown`) for storage-layer use.
   */
  getViews: () => ImmutableIEvDbViewMap;

  /**
   * Returns the immutable view snapshot for the given name, or `undefined` if not found.
   * @param viewName The registered name of the view.
   */
  getView(viewName: string): ImmutableIEvDbView | undefined;

  /**
   * Returns all pending events that have not yet been persisted.
   * Events are unspecialized — payload types are not discriminated at this layer.
   */
  getPendingEvents: () => ReadonlyArray<EvDbEvent>;

  /**
   * Returns all outbox messages (notifications) produced by the pending events.
   * Messages are unspecialized — payload types are not discriminated at this layer.
   */
  getPendingMessages: () => ReadonlyArray<EvDbMessage>;

  /** The address that uniquely identifies this stream in the store. */
  streamAddress: EvDbStreamAddress;
}
