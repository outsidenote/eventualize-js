import type { IEvDbPayloadData } from "./IEvDbPayloadData.js";

export default interface IEvDbEventPayload extends IEvDbPayloadData {
  readonly payloadType: string;
}
