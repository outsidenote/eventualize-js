import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
import { EVDB_DEFAULT_SPANS } from "@eventualize/types/telemetry/EvDbSpanPolicy";
import type { EvDbSpanPolicy } from "@eventualize/types/telemetry/EvDbSpanPolicy";
import { fetchPage } from "./fetchPage.js";
import { withSpanPolicy } from "../otel/withPolicySpan.js";

/**
 * The stream that replay folds events into. Implemented by the factory's
 * internal replay stream; not part of the public API.
 */
export interface IEvDbReplayTarget<TViews> {
  /** The current view states of the replay stream. */
  readonly views: Readonly<TViews>;
  /** Applies a stored event to the views and returns its produced messages. */
  replayEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage>;
}

/** Options for `EvDbReadOnlyStream.open`. */
export interface EvDbReadOnlyStreamOpenOptions<TViews> {
  /** The stream that stored events are folded into. */
  readonly target: IEvDbReplayTarget<TViews>;
  /** The adapter that events are read from. */
  readonly streamStorageAdapter: IEvDbStorageStreamAdapter;
  /** The address of the stream to read. */
  readonly streamAddress: EvDbStreamAddress;
  /** First offset to fetch (views already hold everything before it). */
  readonly fromOffset: number;
  /** The offset to position on. */
  readonly offset: number;
  /** Events fetched per page. A positive integer. */
  readonly pageSize: number;
  /** Span policy for the adapter calls of `forward()`. Default: `EVDB_DEFAULT_SPANS`. */
  readonly spanPolicy?: EvDbSpanPolicy;
}

/** Builds the RangeError for an offset that the stream does not have. */
const notFound = (address: EvDbStreamAddress, offset: number): RangeError =>
  new RangeError(`Offset ${offset} not found in stream ${address.streamType}/${address.streamId}`);

/**
 * Read-only, forward-only cursor over a stored stream.
 *
 * Keeps one page of fetched events plus the current event. Applied events are
 * dropped. The buffer always holds at least one event ahead of `event` unless
 * the stream head was reached, which is what `isHead` reports.
 */
export class EvDbReadOnlyStream<TViews> implements IEvDbReadOnlyStream<TViews> {
  /** Use `EvDbReadOnlyStream.open`. The constructor takes the state that `open` builds. */
  private constructor(
    private readonly target: IEvDbReplayTarget<TViews>,
    private readonly adapter: IEvDbStorageStreamAdapter,
    private readonly address: EvDbStreamAddress,
    private readonly pageSize: number,
    private _event: EvDbEvent,
    private _messages: ReadonlyArray<EvDbMessage>,
    private buffer: EvDbEvent[],
    private nextOffset: number,
    private readonly spanPolicy: EvDbSpanPolicy,
  ) {}

  /**
   * Folds events `fromOffset..offset` into `target` and returns a stream
   * positioned on `offset`.
   * @param options - The replay target, the storage adapter, the stream address, the
   *   first offset to fetch, the offset to position on, and the page size.
   * @returns A stream positioned on the event at `options.offset`. It has already
   *   fetched the next page, so `isHead` is up to date.
   * @throws RangeError when the stream has no event at `options.offset`.
   */
  static async open<TViews>(
    options: EvDbReadOnlyStreamOpenOptions<TViews>,
  ): Promise<EvDbReadOnlyStream<TViews>> {
    const { target, streamStorageAdapter, streamAddress, offset, pageSize } = options;
    let nextOffset = options.fromOffset;

    while (true) {
      const page = await fetchPage(streamStorageAdapter, streamAddress, nextOffset, pageSize);
      if (page.length === 0) throw notFound(streamAddress, offset);
      nextOffset = page[page.length - 1].streamCursor.offset + 1;

      for (let i = 0; i < page.length; i++) {
        const e = page[i];
        const eventOffset = e.streamCursor.offset;
        if (eventOffset > offset) throw notFound(streamAddress, offset);
        const messages = target.replayEvent(e);
        if (eventOffset === offset) {
          const stream = new EvDbReadOnlyStream<TViews>(
            target,
            streamStorageAdapter,
            streamAddress,
            pageSize,
            e,
            messages,
            page.slice(i + 1),
            nextOffset,
            options.spanPolicy ?? EVDB_DEFAULT_SPANS,
          );
          await stream.ensureLookahead();
          return stream;
        }
      }
    }
  }

  /** The event the stream is positioned on. */
  get event(): EvDbEvent {
    return this._event;
  }

  /** View states after `event` was applied. */
  get views(): Readonly<TViews> {
    return this.target.views;
  }

  /** Messages that the producer derives from `event` (recomputed, not read from the outbox). */
  get messages(): ReadonlyArray<EvDbMessage> {
    return this._messages;
  }

  /** `true` when no event is buffered after `event`, i.e. the head was reached at the last fetch. */
  get isHead(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Moves forward up to `steps` events and re-checks storage when the buffer runs out.
   * @param steps - How many events to move forward. A positive integer. Default 1.
   * @returns This stream (the same instance), positioned on the new event.
   * @throws RangeError when `steps` is not a positive integer.
   */
  async forward(steps: number = 1): Promise<IEvDbReadOnlyStream<TViews>> {
    if (!Number.isInteger(steps) || steps < 1) {
      throw new RangeError(`steps must be a positive integer, got ${steps}`);
    }
    for (let moved = 0; moved < steps; moved++) {
      await this.ensureLookahead();
      const next = this.buffer[0];
      if (next === undefined) break;
      // Peek, apply, then shift: a throwing view handler keeps the event buffered for a retry.
      const messages = this.target.replayEvent(next);
      this.buffer.shift();
      this._messages = messages;
      this._event = next;
    }
    await this.ensureLookahead();
    return this;
  }

  /** Fetches the next page when the buffer is empty. */
  private async ensureLookahead(): Promise<void> {
    if (this.buffer.length > 0) return;
    // forward() runs after goToOffset returned, outside its span policy context.
    const page = await withSpanPolicy(this.spanPolicy, () =>
      fetchPage(this.adapter, this.address, this.nextOffset, this.pageSize),
    );
    if (page.length === 0) return;
    this.nextOffset = page[page.length - 1].streamCursor.offset + 1;
    this.buffer = page;
  }
}
