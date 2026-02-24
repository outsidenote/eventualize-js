import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export interface FundsWithdrawalApprovedProps {
  readonly account: string;
  readonly amount: number;
  readonly approvalDate: Date;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;
}

export class FundsWithdrawalApproved implements IEvDbEventPayload {
  readonly payloadType = "FundsWithdrawalApproved" as const;

  readonly account: string;
  readonly amount: number;
  readonly approvalDate: Date;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;

  constructor(props: FundsWithdrawalApprovedProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.approvalDate = props.approvalDate;
    this.currency = props.currency;
    this.session = props.session;
    this.source = props.source;
    this.payer = props.payer;
    this.transactionId = props.transactionId;
  }
}
