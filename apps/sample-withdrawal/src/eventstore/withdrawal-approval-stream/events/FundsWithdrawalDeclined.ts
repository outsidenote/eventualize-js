import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface FundsWithdrawalDeclinedProps {
  readonly account: string;
  readonly session: string;
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
  readonly payer: string;
  readonly source: string;
  readonly transactionId: string;
  readonly declinedDate: Date;
}

export class FundsWithdrawalDeclined implements IEvDbEventPayload {
  readonly payloadType = "FundsWithdrawalDeclined" as const;

  readonly account: string;
  readonly session: string;
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
  readonly payer: string;
  readonly source: string;
  readonly transactionId: string;
  readonly declinedDate: Date;

  constructor(props: FundsWithdrawalDeclinedProps) {
    this.account = props.account;
    this.session = props.session;
    this.currency = props.currency;
    this.amount = props.amount;
    this.reason = props.reason;
    this.payer = props.payer;
    this.source = props.source;
    this.transactionId = props.transactionId;
    this.declinedDate = props.declinedDate;
  }
}
