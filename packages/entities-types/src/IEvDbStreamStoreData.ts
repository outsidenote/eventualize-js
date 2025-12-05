import EvDbStreamAddress from "./EvDbStreamAddress";
import IEvDbView from "./IEvDbView";
import EvDbEvent from "./EvDbEvent";
import EvDbMessage from "./EvDbMessage";

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
