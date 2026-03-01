import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class FundsCaptured implements IEvDbEventPayload {
  readonly payloadType = "FundsCaptured";
  [key: string]: unknown;
  constructor(public readonly amount: number, public readonly Currency: string) {}
}
