import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { STREAM_TYPE } from "../domain/streamType.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";

export const TIMELINE_LIMIT = 5000;

export type TimelineEntry = {
  readonly offset: number;
  readonly eventType: string;
  readonly value: number;
};

export type Timeline = { readonly lastOffset: number; readonly events: TimelineEntry[] };

/** Raw event summaries (no views) for the last TIMELINE_LIMIT events. */
export async function getTimeline(storage: PlaygroundStorage, streamId: string): Promise<Timeline> {
  const lastOffset = await storage.getLastOffsetAsync(new EvDbStreamAddress(STREAM_TYPE, streamId));
  if (lastOffset < 0) throw new NotFoundError(`account ${streamId} not found`);
  const from = Math.max(0, lastOffset - (TIMELINE_LIMIT - 1));
  const events: TimelineEntry[] = [];
  for await (const e of storage.getEventsAsync(new EvDbStreamCursor(STREAM_TYPE, streamId, from))) {
    const offset = e.streamCursor.offset;
    if (offset > lastOffset) break;
    const value = e.payload.value;
    events.push({ offset, eventType: e.eventType, value: typeof value === "number" ? value : 0 });
  }
  return { lastOffset, events };
}
