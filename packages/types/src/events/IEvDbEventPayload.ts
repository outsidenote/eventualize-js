export default interface IEvDbEventPayload {
  readonly eventType: string;
  [key: string]: unknown;
}
