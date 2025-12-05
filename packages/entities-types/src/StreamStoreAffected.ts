 /**
 * Indicate how many events and messages were affected.
 */

 type EvDbOutboxShardName = string;

export default class StreamStoreAffected {
  public readonly numEvents: number;
  public readonly numMessages: ReadonlyMap<EvDbOutboxShardName, number>;

  public static readonly Empty = new StreamStoreAffected(0, new Map());

  constructor(
    numEvents: number,
    numMessages: ReadonlyMap<EvDbOutboxShardName, number>
  ) {
    this.numEvents = numEvents;
    this.numMessages = numMessages;
  }
}