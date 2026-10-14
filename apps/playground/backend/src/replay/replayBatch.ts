import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import PlaygroundFundsStreamFactory from "../domain/PlaygroundFundsStreamFactory.js";
import { STREAM_TYPE } from "../domain/streamType.js";
import type { PlaygroundViews } from "../domain/views.js";
import { copyViews } from "../domain/views.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export type EventMeta = {
  readonly eventType: string;
  readonly capturedAt: string;
  readonly capturedBy: string;
  readonly storedAt: string | null;
  readonly traceparent: string | null;
};

export type MessageDto = {
  readonly messageType: string;
  readonly payload: IEvDbPayloadData | null;
};

export type ReplayItem = {
  readonly offset: number;
  readonly event_meta: EventMeta;
  readonly event_payload: IEvDbPayloadData;
  readonly views: PlaygroundViews;
  readonly messages: MessageDto[];
};

export type ReplayBatch = {
  readonly streamId: string;
  readonly lastOffset: number;
  readonly isHead: boolean;
  readonly items: ReplayItem[];
};

export type ReplayOptions = {
  readonly offset: number;
  readonly batchSize: number;
  readonly snapshots: boolean;
};

/** Snapshot of the read-only stream at its current position. Deep-copied: `forward()` mutates the stream. */
function toItem(stream: IEvDbReadOnlyStream<PlaygroundViews>): ReplayItem {
  const e = stream.event;
  return {
    offset: e.streamCursor.offset,
    event_meta: {
      eventType: e.eventType,
      capturedAt: e.capturedAt.toISOString(),
      capturedBy: e.capturedBy,
      storedAt: e.storedAt ? e.storedAt.toISOString() : null,
      traceparent: e.traceparent ?? null,
    },
    event_payload: structuredClone(e.payload),
    views: copyViews(stream.views),
    messages: stream.messages.map((m) => ({
      messageType: m.messageType,
      payload: m.payload === undefined ? null : structuredClone(m.payload),
    })),
  };
}

/** goToOffset throws RangeError when no event exists at the offset; map only that to NotFoundError. */
async function openAtOffset(
  storage: PlaygroundStorage,
  streamId: string,
  options: ReplayOptions,
): Promise<IEvDbReadOnlyStream<PlaygroundViews>> {
  try {
    return await PlaygroundFundsStreamFactory.goToOffset(
      streamId,
      options.offset,
      storage,
      options.snapshots ? storage : undefined,
    );
  } catch (err) {
    if (err instanceof RangeError) throw new NotFoundError(err.message);
    throw err;
  }
}

/**
 * Opens the stream at `offset` with `goToOffset` and steps forward until the batch
 * holds `batchSize` items or the stream reaches its head.
 */
export async function replayBatch(
  storage: PlaygroundStorage,
  streamId: string,
  options: ReplayOptions,
): Promise<ReplayBatch> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  if (options.offset > lastOffset) {
    throw new NotFoundError(`no event at offset ${options.offset} (last offset ${lastOffset})`);
  }

  const stream = await openAtOffset(storage, streamId, options);

  const items: ReplayItem[] = [toItem(stream)];
  while (items.length < options.batchSize && !stream.isHead) {
    const before = stream.event.streamCursor.offset;
    await stream.forward();
    if (stream.event.streamCursor.offset === before) break;
    items.push(toItem(stream));
  }

  const lastItemOffset = items[items.length - 1].offset;
  return {
    streamId,
    lastOffset: Math.max(lastOffset, lastItemOffset),
    isHead: stream.isHead,
    items,
  };
}
