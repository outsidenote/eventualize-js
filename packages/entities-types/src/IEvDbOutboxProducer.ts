import EvDbEvent from "./EvDbEvent";
import IEvDbViewStore from "./IEvDbViewStore";

export default interface IEvDbOutboxProducer {
    /**
     * State transform abstraction into the outbox.
     * @param event The event to produce outbox messages for
     * @param views The list of views
     */
    onProduceOutboxMessages(
        event: EvDbEvent,
        views: readonly IEvDbViewStore[]
    ): void;
}
