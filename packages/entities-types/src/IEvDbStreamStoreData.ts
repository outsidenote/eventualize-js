import EvDbStreamAddress from "./EvDbStreamAddress.js";
import IEvDbView from "./IEvDbView.js";
import EvDbEvent from "./EvDbEvent.js";
import EvDbMessage from "./EvDbMessage.js";

export default interface IEvDbStreamStoreData {
    /** Serialization options (optional) */
    options?: Record<string, any>; // JsonSerializerOptions equivalent in TS

    /** Views (unspecialized) */
    getViews: () => ReadonlyArray<IEvDbView>;

    /** Unspecialized events */
    getEvents: () => ReadonlyArray<EvDbEvent>;

    /** Unspecialized notifications */
    getMessages: () => ReadonlyArray<EvDbMessage>;

    /** Stream address (uniqueness) */
    streamAddress: EvDbStreamAddress;
}
