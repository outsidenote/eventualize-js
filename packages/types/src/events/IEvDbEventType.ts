import type { IEvDbPayloadData } from "./IEvDbPayloadData.js";

export default interface IEvDbEventType extends IEvDbPayloadData {
  /**
   * The type of the event
   */
  readonly eventType: string;
}
