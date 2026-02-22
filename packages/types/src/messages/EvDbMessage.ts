import type EvDbEvent from "../events/EvDbEvent.js";
import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type { IEvDbPayloadData } from "../events/IEvDbPayloadData.js";
import type IEvDbEventPayload from "../events/IEvDbEventPayload.js";

export default class EvDbMessage {
  public static readonly Empty: EvDbMessage = EvDbMessage.createWithId(
    "",
    "",
    "",
    "",
    "",
    "",
    new Date(0),
    "",
    {} as EvDbStreamCursor,
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
    public readonly payload: IEvDbPayloadData,
    public readonly storedAt?: Date,
  ) {}

  public static createWithId(
    id: string,
    eventType: string,
    channel: string,
    shardName: string,
    messageType: string,
    serializeType: string,
    capturedAt: Date,
    capturedBy: string,
    streamCursor: EvDbStreamCursor,
    payload: any,
  ): EvDbMessage {
    return new EvDbMessage(
      id,
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

  public static create(
    eventType: string,
    channel: string,
    shardName: string,
    messageType: string,
    serializeType: string,
    capturedAt: Date,
    capturedBy: string,
    streamCursor: EvDbStreamCursor,
    payload: any,
  ): EvDbMessage {
    return new EvDbMessage(
      crypto.randomUUID(),
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

  public static createFromEvent(
    event: EvDbEvent,
    payload: IEvDbEventPayload,
    channel: string = "default",
    serializeType: string = "json",
  ): EvDbMessage {
    return new EvDbMessage(
      crypto.randomUUID(),
      event.eventType,
      channel,
      "default",
      payload.payloadType,
      serializeType,
      event.capturedAt,
      event.capturedBy,
      event.streamCursor,
      payload,
    );
  }
}
