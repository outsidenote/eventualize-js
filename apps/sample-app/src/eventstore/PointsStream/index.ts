import { PointsAdded, PointsMultiplied, PointsSubtracted } from './events.js';
import { StreamFactoryBuilder, StreamWithEventMethods } from '@eventualize/core/EvDbStreamFactory';
import { CountViewState, SumViewState, sumViewHandlers, countViewHandlers } from './views.js';
import messages from './messages.js'

const PointsStreamFactory = new StreamFactoryBuilder('PointsStream', messages)
    .withEventType(PointsAdded)
    .withEventType(PointsSubtracted)
    .withEventType(PointsMultiplied)
    .withView('Sum', SumViewState, sumViewHandlers)
    .withView('Count', CountViewState, countViewHandlers)
    .build();

export default PointsStreamFactory;

export type PointsStreamType = typeof PointsStreamFactory.StreamType;

