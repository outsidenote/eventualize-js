import { SumViewFactory, CountViewFactory } from './views.js';
import { PointsStreamEvents } from './events.js';
import { StreamFactoryBuilder } from '@eventualize/core/EvDbStreamFactory';
import messages from './messages.js'

export default new StreamFactoryBuilder<PointsStreamEvents, "PointsStream">('PointsStream', messages)
    .withView(SumViewFactory)
    .withView(CountViewFactory)
    .build();
