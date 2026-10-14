import type { FundsDeposited, FundsWithdrawn, WithdrawalDenied } from "./events.js";

/** Any event with `value` at or above this is a large transaction. */
export const LARGE_TRANSACTION = 10_000;
const RISK_MAX = 10;

export type BalanceState = { readonly amount: number; readonly currency: string };
export type StatsState = {
  readonly deposits: number;
  readonly withdrawals: number;
  readonly denied: number;
};
export type PlaygroundViews = {
  readonly balance: BalanceState;
  readonly stats: StatsState;
  readonly risk: number;
};

export const balanceDefault: BalanceState = { amount: 0, currency: "" };
export const statsDefault: StatsState = { deposits: 0, withdrawals: 0, denied: 0 };
export const riskDefault: number = 0;

// All handlers are pure: they return a new state and never change `state`.

export const balanceOnDeposited = (state: BalanceState, e: FundsDeposited): BalanceState => ({
  amount: state.amount + e.value,
  currency: e.currency,
});
export const balanceOnWithdrawn = (state: BalanceState, e: FundsWithdrawn): BalanceState => ({
  amount: state.amount - e.value,
  currency: state.currency,
});

export const statsOnDeposited = (state: StatsState): StatsState => ({
  ...state,
  deposits: state.deposits + 1,
});
export const statsOnWithdrawn = (state: StatsState): StatsState => ({
  ...state,
  withdrawals: state.withdrawals + 1,
});
export const statsOnDenied = (state: StatsState): StatsState => ({
  ...state,
  denied: state.denied + 1,
});

const clampRisk = (risk: number): number => Math.min(RISK_MAX, Math.max(0, risk));
const largeBump = (value: number): number => (value >= LARGE_TRANSACTION ? 3 : 0);

export const riskOnDeposited = (state: number, e: FundsDeposited): number =>
  clampRisk(e.value >= LARGE_TRANSACTION ? state + 3 : state - 0.5);
export const riskOnWithdrawn = (state: number, e: FundsWithdrawn): number =>
  clampRisk(state + largeBump(e.value));
export const riskOnDenied = (state: number, e: WithdrawalDenied): number =>
  clampRisk(state + 2 + largeBump(e.value));

/** Deep copy of the view states. Use it before the source stream moves on. */
export function copyViews(views: Readonly<PlaygroundViews>): PlaygroundViews {
  return structuredClone({ balance: views.balance, stats: views.stats, risk: views.risk });
}
