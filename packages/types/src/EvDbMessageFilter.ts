import { EvDbChannelName, EvDbMessageTypeName } from "../../types/src/primitiveTypes.js";

export default class EvDbMessageFilter {
  public readonly since: Date;
  public readonly channels: ReadonlyArray<EvDbChannelName>;
  public readonly messageTypes: ReadonlyArray<EvDbMessageTypeName>;

  constructor(
    since: Date = new Date(0),
    channels: ReadonlyArray<EvDbChannelName> = [],
    messageTypes: ReadonlyArray<EvDbMessageTypeName> = []
  ) {
    this.since = since;
    this.channels = channels;
    this.messageTypes = messageTypes;
  }

  /**
   * Creates a filter with the specified since date
   */
  public static create(since: Date): EvDbMessageFilter {
    return new EvDbMessageFilter(since);
  }

  /**
   * Creates a filter from a Date
   */
  public static fromDate(date: Date): EvDbMessageFilter {
    return new EvDbMessageFilter(date);
  }

  /**
   * Creates a filter from a channel name
   */
  public static fromChannel(channel: EvDbChannelName): EvDbMessageFilter {
    return new EvDbMessageFilter(new Date(0), [channel]);
  }

  /**
   * Creates a filter from a message type name
   */
  public static fromMessageType(messageType: EvDbMessageTypeName): EvDbMessageFilter {
    return new EvDbMessageFilter(new Date(0), [], [messageType]);
  }

  /**
   * Adds a channel to the filter
   * Restrict the messages to those that match the specified channels.
   * Ignore this property if you want to get all messages.
   */
  public addChannel(channel: EvDbChannelName): EvDbMessageFilter {
    return new EvDbMessageFilter(
      this.since,
      [...this.channels, channel],
      this.messageTypes
    );
  }

  /**
   * Adds a message type to the filter
   * Restrict the messages to those that match the specified message-types.
   * Ignore this property if you want to get all messages.
   */
  public addMessageType(messageType: EvDbMessageTypeName): EvDbMessageFilter {
    return new EvDbMessageFilter(
      this.since,
      this.channels,
      [...this.messageTypes, messageType]
    );
  }

  /**
   * Creates a new filter with updated properties (similar to C# 'with' expression)
   */
  public with(updates: {
    since?: Date;
    channels?: ReadonlyArray<EvDbChannelName>;
    messageTypes?: ReadonlyArray<EvDbMessageTypeName>;
  }): EvDbMessageFilter {
    return new EvDbMessageFilter(
      updates.since ?? this.since,
      updates.channels ?? this.channels,
      updates.messageTypes ?? this.messageTypes
    );
  }
}