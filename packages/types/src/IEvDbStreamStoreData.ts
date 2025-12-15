import EvDbStreamAddress from "./EvDbStreamAddress.js";
import IEvDbView from "./IEvDbView.js";
import EvDbStreamEvent from "./IEvDbEvent.js";
import EvDbMessage from "./EvDbMessage.js";

type ImmutableIEvDbView = Readonly<IEvDbView>;
export type ImmutableIEvDbViewMap = Readonly<Record<string, ImmutableIEvDbView>>;


export default interface IEvDbStreamStoreData {
    /** Serialization options (optional) */
    options?: Record<string, any>; // JsonSerializerOptions equivalent in TS

    /** Views (unspecialized) */
    getViews: () => ImmutableIEvDbViewMap;

    getView(viewName: string): ImmutableIEvDbView | undefined;

    /** Unspecialized events */
    getEvents: () => ReadonlyArray<EvDbStreamEvent>;

    /** Unspecialized notifications */
    getMessages: () => ReadonlyArray<EvDbMessage>;

    /** Stream address (uniqueness) */
    streamAddress: EvDbStreamAddress;
}
