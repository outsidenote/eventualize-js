import EvDbStreamCursor from "./EvDbStreamCursor";

export default interface IEvDbEventMetadata {
  /**
   * The full address of the stream including the offset
   */
  readonly streamCursor: EvDbStreamCursor;

  /**
   * The type of the event
   */
  readonly eventType: string;

  /**
   * The time of capturing the event (client side time)
   */
  readonly capturedAt: Date;

  readonly storedAt?: Date | null;

  /**
   * The user that captured the event
   */
  readonly capturedBy: string;

  /**
   * Json format of the Trace (Open Telemetry) propagated context at the persistent time.
   * The value will be null if the Trace is null when persisting the record or before persistent.
   */
  // TODO: implement telemetry context
//   readonly telemetryContext: EvDbTelemetryContextName;
}