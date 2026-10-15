export type FundsDeposited = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
};

export type FundsWithdrawn = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
};

export type WithdrawalDenied = {
  readonly description: string;
  readonly value: number;
  readonly currency: string;
  readonly reason: string;
};
