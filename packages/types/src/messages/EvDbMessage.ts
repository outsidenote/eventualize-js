import type IEvDbEventMetadata from "../events/IEvDbEventMetadata.js";
import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type { IEvDbPayloadData } from "../events/IEvDbPayloadData.js";
import { context, propagation } from "@opentelemetry/api";

export default class EvDbMessage {
  public static readonly Empty: EvDbMessage = EvDbMessage.create(
    {} as EvDbStreamCursor,
    "",
    "",
    undefined,
  );

  private constructor(
    public readonly id: string,
    public readonly eventType: string,
    public readonly channel: string,
    public readonly shardName: string,
    public readonly messageType: string,
    public readonly serializeType: string,
    public readonly capturedAt: Date,
    public readonly capturedBy: string,
    public readonly streamCursor: EvDbStreamCursor,
    public readonly payload: IEvDbPayloadData | undefined,
    public readonly storedAt?: Date,
    public readonly traceparent?: string,
    public readonly tracestate?: string,
  ) {}

  private static captureTraceparent(): { traceparent?: string; tracestate?: string } {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    return { traceparent: carrier["traceparent"], tracestate: carrier["tracestate"] };
  }

  public static create(
    streamCursor: EvDbStreamCursor,
    eventType: string,
    messageType: string,
    payload: IEvDbPayloadData | undefined,
    channel: string = "default",
    shardName: string = "default",
    messageId: string = crypto.randomUUID(),
    serializeType: string = "json",
    capturedAt: Date = new Date(),
    capturedBy: string = "",
    traceparent?: string,
    tracestate?: string,
  ): EvDbMessage {
    // Capture trace context if not provided
    if (traceparent === undefined || tracestate === undefined) {
      const { traceparent: capturedTP, tracestate: capturedTS } = this.captureTraceparent();
      traceparent = traceparent ?? capturedTP;
      tracestate = tracestate ?? capturedTS;
    }

    return new EvDbMessage(
      messageId,
      eventType,
      channel,
      shardName,
      messageType,
      serializeType,
      capturedAt,
      capturedBy,
      streamCursor,
      payload,
      undefined,
      traceparent,
      tracestate,
    );
  }

  public withTraceparent(traceparent?: string, tracestate?: string): EvDbMessage {
    // Capture current trace context if not provided
    if (traceparent === undefined || tracestate === undefined) {
      const { traceparent: capturedTP, tracestate: capturedTS } = EvDbMessage.captureTraceparent();
      traceparent = traceparent ?? capturedTP;
      tracestate = tracestate ?? capturedTS;
    }

    return new EvDbMessage(
      this.id,
      this.eventType,
      this.channel,
      this.shardName,
      this.messageType,
      this.serializeType,
      this.capturedAt,
      this.capturedBy,
      this.streamCursor,
      this.payload,
      this.storedAt,
      traceparent,
      tracestate,
    );
  }

  /**
   * Returns a copy of this message on another channel. All other fields are kept.
   * Use it to reroute messages, e.g. in a clone `projectMessage`.
   * @param channel - The channel of the new message.
   * @returns A new `EvDbMessage`. This message is not changed.
   */
  public withChannel(channel: string): EvDbMessage {
    return new EvDbMessage(
      this.id,
      this.eventType,
      channel,
      this.shardName,
      this.messageType,
      this.serializeType,
      this.capturedAt,
      this.capturedBy,
      this.streamCursor,
      this.payload,
      this.storedAt,
      this.traceparent,
      this.tracestate,
    );
  }

  public static createFromMetadata(
    metadata: IEvDbEventMetadata,
    messageType: string,
    payload: IEvDbPayloadData,
    channel: string = "default",
    shardName: string = "default",
    messageId: string = crypto.randomUUID(),
    serializeType: string = "json",
    traceparent?: string,
    tracestate?: string,
  ): EvDbMessage {
    // Capture trace context if not provided
    if (traceparent === undefined || tracestate === undefined) {
      const { traceparent: capturedTP, tracestate: capturedTS } = this.captureTraceparent();
      traceparent = traceparent ?? capturedTP;
      tracestate = tracestate ?? capturedTS;
    }

    return new EvDbMessage(
      messageId,
      metadata.eventType,
      channel,
      shardName,
      messageType,
      serializeType,
      metadata.capturedAt,
      metadata.capturedBy,
      metadata.streamCursor,
      payload,
      undefined,
      traceparent,
      tracestate,
    );
  }
}
