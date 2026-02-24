import type { Command } from "../types/command.js";

export interface ApproveWithdrawalProps {
  readonly account: string;
  readonly amount: number;
  readonly approvalDate: Date;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;
  readonly transactionTime: Date;
  readonly currentBalance: number;
}

export class ApproveWithdrawal implements Command {
  readonly commandType = "ApproveWithdrawal" as const;

  readonly account: string;
  readonly amount: number;
  readonly approvalDate: Date;
  readonly currency: string;
  readonly session: string;
  readonly source: string;
  readonly payer: string;
  readonly transactionId: string;
  readonly transactionTime: Date;
  readonly currentBalance: number;

  constructor(props: ApproveWithdrawalProps) {
    this.account = props.account;
    this.amount = props.amount;
    this.approvalDate = props.approvalDate;
    this.currency = props.currency;
    this.session = props.session;
    this.source = props.source;
    this.payer = props.payer;
    this.transactionId = props.transactionId;
    this.transactionTime = props.transactionTime;
    this.currentBalance = props.currentBalance;
  }
}
