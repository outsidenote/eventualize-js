import {SumViewFactory, CountViewFactory} from './views.js';
import { PointsStreamEvents } from './events.js';
import { StreamFactoryBuilder } from '@eventualize/core/EvDbStreamFactory';

export default new StreamFactoryBuilder<PointsStreamEvents, "PointsStream">('PointsStream')
    .withView(SumViewFactory)
    .withView(CountViewFactory)
    .build();
