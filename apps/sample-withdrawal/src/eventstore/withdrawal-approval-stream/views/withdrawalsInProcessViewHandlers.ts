import type { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../events/FundsWithdrawalDeclined.js";
import type { WithdrawalsInProcessViewState } from "./WithdrawalsInProcessViewState.js";

export const withdrawalsInProcessViewHandlers = {
  FundsWithdrawalApproved: (
    _state: WithdrawalsInProcessViewState,
    event: FundsWithdrawalApproved,
  ): WithdrawalsInProcessViewState => ({
    account: event.account,
    currency: event.currency,
    approvalDate: event.approvalDate,
    amount: event.amount,
    session: event.session,
  }),

  FundsWithdrawalDeclined: (
    state: WithdrawalsInProcessViewState,
    _event: FundsWithdrawalDeclined,
  ): WithdrawalsInProcessViewState => state,
};
