import EvDbStreamEvent from "@eventualize/types/EvDbEvent";
import EvDbMessage from "@eventualize/types/EvDbMessage";
import EVDbMessagesProducer from "@eventualize/types/EvDbMessagesProducer";
import { PointsAdded } from "./events.js";
import { SumViewState, CountViewState } from "./views.js";

const producer: EVDbMessagesProducer = (event: EvDbStreamEvent, viewStates: Readonly<Record<string, unknown>>): EvDbMessage[] => {
    if (event.eventType === new PointsAdded({ points: 0 }).eventType) {
        return [
            EvDbMessage.fromEvent(
                'Points Added With Sum Notification',
                event,
                {
                    pointsAdded: (event.payload as PointsAdded).payload.points,
                    PointsSum: (viewStates['SumView'] as SumViewState).sum
                }

            ),
            EvDbMessage.fromEvent(
                'Points Added With Count Notification',
                event,
                {
                    pointsAdded: (event.payload as PointsAdded).payload.points,
                    PointsCount: (viewStates['CountView'] as CountViewState).count
                }

            )
        ]
    }

    return [];
}

export default producer;