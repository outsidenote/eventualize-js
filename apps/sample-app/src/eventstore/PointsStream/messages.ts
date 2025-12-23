import EvDbEvent from "@eventualize/types/EvDbEvent";
import EvDbMessage from "@eventualize/types/EvDbMessage";
import EVDbMessagesProducer from "@eventualize/types/EvDbMessagesProducer";
import { PointsAdded, PointsMultiplied } from "./events.js";
import { SumViewState, CountViewState } from "./views.js";


export const poinstAddedMessages = (event: EvDbEvent, viewStates: Readonly<Record<string, unknown>>) => [
    EvDbMessage.createFromEvent(
        event,
        {
            payloadType: 'Points Added With Sum Notification',
            pointsAdded: (event.payload as PointsAdded).points,
            PointsSum: (viewStates['Sum'] as SumViewState).sum
        }

    ),
    EvDbMessage.createFromEvent(
        event,
        {
            payloadType: 'Points Added With Count Notification',
            pointsAdded: (event.payload as PointsAdded).points,
            PointsCount: (viewStates['Count'] as CountViewState).count
        }

    )
];

export const pointsMultipliedMessages = (event: EvDbEvent, viewStates: Readonly<Record<string, unknown>>) => [
    EvDbMessage.createFromEvent(
        event,
        {
            payloadType: 'Points Multiplied',
            multiplier: (event.payload as PointsMultiplied).multiplier,
        })
];

