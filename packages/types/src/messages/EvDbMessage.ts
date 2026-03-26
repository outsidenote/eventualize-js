import type IEvDbEventMetadata from "../events/IEvDbEventMetadata.js";
import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type { IEvDbPayloadData } from "../events/IEvDbPayloadData.js";

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
  ) { }

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
  ): EvDbMessage {
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
  ): EvDbMessage {
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
    );
  }
}
