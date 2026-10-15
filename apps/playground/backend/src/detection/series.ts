import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import { STREAM_TYPE } from "../domain/streamType.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";
import type { SeriesPoint } from "./detect.js";

/**
 * Balance and risk at every offset, read through the library replay path
 * (goToOffset(0) + forward(), no snapshots) so detection agrees with what replay shows.
 */
export async function readSeries(
  storage: PlaygroundStorage,
  streamId: string,
  maxScan: number,
): Promise<{ points: SeriesPoint[]; lastOffset: number; truncated: boolean }> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  const stream = await PlaygroundFundsStreamFactory.goToOffset(streamId, 0, storage);
  const point = (): SeriesPoint => ({
    offset: stream.event.streamCursor.offset,
    balance: stream.views.balance.amount,
    risk: stream.views.risk,
  });
  const points: SeriesPoint[] = [point()];
  while (!stream.isHead && points.length < maxScan) {
    const before = stream.event.streamCursor.offset;
    await stream.forward();
    if (stream.event.streamCursor.offset === before) break;
    points.push(point());
  }
  return { points, lastOffset, truncated: !stream.isHead };
}
