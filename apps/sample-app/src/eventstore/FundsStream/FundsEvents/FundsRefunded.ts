import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class FundsRefunded implements IEvDbEventPayload {
  readonly payloadType = "FundsRefunded";
  [key: string]: unknown;
  constructor(public readonly amount: number, public readonly Currency: string) {}
}
