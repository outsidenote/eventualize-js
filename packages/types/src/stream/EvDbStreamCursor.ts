import EvDbStreamAddress from "./EvDbStreamAddress.js";

export default class EvDbStreamCursor extends EvDbStreamAddress {
  public readonly offset: number;

  constructor(streamType: string, streamId: string, offset: number);
  constructor(streamAddress: EvDbStreamAddress, offset: number);

  constructor(
    streamTypeOrAddress: string | EvDbStreamAddress,
    streamIdOrOffset: string | number,
    offset?: number,
  ) {
    if (
      typeof streamTypeOrAddress === "string" &&
      typeof streamIdOrOffset === "string" &&
      (!offset || typeof offset === "number")
    ) {
      const streamType = streamTypeOrAddress;
      const streamId = streamIdOrOffset;
      super(streamType, streamId);
      this.offset = offset ?? 0;
    } else if (
      streamTypeOrAddress instanceof EvDbStreamAddress &&
      (!streamIdOrOffset || typeof streamIdOrOffset === "number")
    ) {
      const streamType = streamTypeOrAddress.streamType;
      const streamId = streamTypeOrAddress.streamId;
      super(streamType, streamId);
      this.offset = (streamIdOrOffset as number) ?? 0;
    } else {
      throw new Error("Invalid constructor arguments for EvDbStreamCursor");
    }
  }

  /**
   * Checks if cursor matches the given stream type
   */
  equals(other: EvDbStreamCursor): boolean {
    return (
      this.streamType === other.streamType &&
      this.streamId === other.streamId &&
      this.offset === other.offset
    );
  }

  public isEqualsStreamType(streamType: string): boolean {
    return this.streamType === streamType;
  }

  /**
   * Checks if cursor matches the given stream address
   */
  public isEqualsAddress(address: EvDbStreamAddress): boolean {
    return this.streamType === address.streamType && this.streamId === address.streamId;
  }

  /**
   * Converts cursor to stream address
   */
  public toStreamAddress(): EvDbStreamAddress {
    return new EvDbStreamAddress(this.streamType, this.streamId);
  }
}
