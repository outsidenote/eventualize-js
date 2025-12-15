import EvDbStreamCursor from "./EvDbStreamCursor.js";

export default interface IEvDbStreamEventMetadata extends IEvDbEventMetadata {
  /**
   * The full address of the stream including the offset
   */
  readonly streamCursor: EvDbStreamCursor;


  /**
   * Json format of the Trace (Open Telemetry) propagated context at the persistent time.
   * The value will be null if the Trace is null when persisting the record or before persistent.
  */
  // TODO: implement telemetry context
  //   readonly telemetryContext: EvDbTelemetryContextName;
}

export interface IEvDbEventMetadata {
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

}