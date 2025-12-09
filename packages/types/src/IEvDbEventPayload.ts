export interface IEvDbPayloadData {
  [key: string]: any;
}

export default interface IEvDbEventPayload extends IEvDbPayloadData {
  readonly payloadType: string;
}

