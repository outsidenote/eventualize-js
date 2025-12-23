import { SumViewFactory, CountViewFactory } from './views.js';
import { PointsAdded, PointsMultiplied, PointsSubtracted } from './events.js';
import { StreamFactoryBuilder, StreamWithEventMethods } from '@eventualize/core/EvDbStreamFactory';
import messages from './messages.js'

export default new StreamFactoryBuilder('PointsStream', messages)
    .withEventType(PointsAdded)
    .withEventType(PointsSubtracted)
    .withEventType(PointsMultiplied)
    .withView(SumViewFactory)
    .withView(CountViewFactory)
    .build();

export type PointsStreamType = StreamWithEventMethods<PointsAdded | PointsMultiplied | PointsSubtracted>;    
