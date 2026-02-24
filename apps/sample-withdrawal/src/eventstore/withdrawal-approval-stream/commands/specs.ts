import type { ApproveWithdrawal } from "./ApproveWithdrawal.js";

/**
 * Named spec predicates derived from the event model's GWT specifications.
 * Each function maps 1:1 to a named spec in the event model diagram.
 */

/**
 * spec: Insufficient Effective Funds Withdrawals
 *
 * WHEN: ApproveWithdrawal where currentBalance < amount
 * THEN: FundsWithdrawalDeclined
 */
export const hasInsufficientEffectiveFunds = (command: ApproveWithdrawal): boolean =>
  command.currentBalance < command.amount;

/**
 * spec: Sufficient Funds Withdrawal Approval
 *
 * WHEN: ApproveWithdrawal where currentBalance >= amount
 * THEN: FundsWithdrawalApproved
 */
export const hasSufficientFunds = (command: ApproveWithdrawal): boolean =>
  command.currentBalance >= command.amount;
