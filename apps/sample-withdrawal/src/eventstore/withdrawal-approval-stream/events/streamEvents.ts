import type { FundsWithdrawalApproved } from "./FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "./FundsWithdrawalDeclined.js";

export type WithdrawalStreamEvents = FundsWithdrawalApproved | FundsWithdrawalDeclined;
