
export default interface IEvDbEventPayload {
  readonly payloadType: string;
  [key: string]: any;
}