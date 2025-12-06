import sumViewFactory from './SumView.js';
import countViewFactory from './CountView.js';
import { PointsStreamEvents } from './StreamEvents.js';
import { StreamFactoryBuilder } from '@eventualize/entities-types/StreamFactory';

export default new StreamFactoryBuilder<PointsStreamEvents>('PointsStream')
  .withView(sumViewFactory)
  .withView(countViewFactory)
  .build();
