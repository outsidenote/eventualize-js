import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import { STREAM_TYPE } from "../domain/streamType.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export type AccountHead = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly views: PlaygroundViews;
};

export async function getHead(storage: PlaygroundStorage, streamId: string): Promise<AccountHead> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  const stream = await PlaygroundFundsStreamFactory.get(streamId, storage, storage);
  return { streamId, lastOffset, views: copyViews(stream.views) };
}
