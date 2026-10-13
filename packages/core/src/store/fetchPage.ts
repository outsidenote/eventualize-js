import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";

/**
 * Fetches up to `pageSize` events starting at `fromOffset`, then closes the
 * adapter iterator so no adapter span or query stays open between calls.
 * Shared by replay (`EvDbReadOnlyStream`) and `clone`.
 * @param adapter - The storage adapter to read from.
 * @param address - The address of the stream to read.
 * @param fromOffset - The first offset to read (inclusive).
 * @param pageSize - Maximum number of events to return. Also passed to the adapter as its
 *   query page size.
 * @returns The events in ascending offset order. Empty when none exist from `fromOffset`.
 */
export async function fetchPage(
  adapter: IEvDbStorageStreamAdapter,
  address: EvDbStreamAddress,
  fromOffset: number,
  pageSize: number,
): Promise<EvDbEvent[]> {
  const page: EvDbEvent[] = [];
  for await (const e of adapter.getEventsAsync(
    new EvDbStreamCursor(address, fromOffset),
    pageSize,
  )) {
    page.push(e);
    if (page.length >= pageSize) break;
  }
  return page;
}
