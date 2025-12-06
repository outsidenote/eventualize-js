import sumViewFactory from './SumView.js';
import countViewFactory from './CountView.js';
import { PointsStreamEvents } from './StreamEvents.js';
import { StreamFactoryBuilder } from '@eventualize/entities-types/EvDbStreamFactory';

export default new StreamFactoryBuilder<PointsStreamEvents, "PointsStream">('PointsStream')
    .withView(sumViewFactory)
    .withView(countViewFactory)
    .build();
