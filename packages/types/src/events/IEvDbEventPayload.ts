import type { IEvDbPayloadData } from "./IEvDbPayloadData.js";

/**
 * @internal
 * Framework-internal type for fully-augmented event payloads.
 * Consumer event types do NOT need to implement or extend this.
 * The framework adds `payloadType` automatically at append time.
 */
export default interface IEvDbEventPayload extends IEvDbPayloadData {
  readonly payloadType: string;
}
