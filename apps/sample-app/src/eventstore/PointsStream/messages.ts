import EvDbEvent from "@eventualize/types/EvDbEvent";
import EvDbMessage from "@eventualize/types/EvDbMessage";
import EVDbMessagesProducer from "@eventualize/types/EvDbMessagesProducer";
import { PointsAdded } from "./events.js";
import { SumViewState, CountViewState } from "./views.js";

const producer: EVDbMessagesProducer = (event: EvDbEvent, viewStates: Readonly<Record<string, unknown>>): EvDbMessage[] => {
    if (event.eventType === new PointsAdded(0).payloadType) {
        return [
            EvDbMessage.createFromEvent(
                event,
                {
                    payloadType: 'Points Added With Sum Notification',
                    pointsAdded: (event.payload as PointsAdded).points,
                    PointsSum: (viewStates['SumView'] as SumViewState).sum
                }

            ),
            EvDbMessage.createFromEvent(
                event,
                {
                    payloadType: 'Points Added With Count Notification',
                    pointsAdded: (event.payload as PointsAdded).points,
                    PointsCount: (viewStates['CountView'] as CountViewState).count
                }

            )
        ]
    }

    return [];
}

export default producer;