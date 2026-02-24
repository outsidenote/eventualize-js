import { FundsWithdrawalApproved } from "./events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "./events/FundsWithdrawalDeclined.js";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import { withdrawalApprovedMessages } from "./messages/approvedMessages.js";
import { withdrawalDeclinedMessages } from "./messages/declinedMessages.js";
import { WithdrawalsInProcessViewState } from "./views/WithdrawalsInProcessViewState.js";
import { withdrawalsInProcessViewHandlers } from "./views/withdrawalsInProcessViewHandlers.js";

const WithdrawalApprovalStreamFactory = new StreamFactoryBuilder("WithdrawalApprovalStream")
  .withEventType(FundsWithdrawalApproved, withdrawalApprovedMessages)
  .withEventType(FundsWithdrawalDeclined, withdrawalDeclinedMessages)
  .withView("WithdrawalsInProcess", WithdrawalsInProcessViewState, withdrawalsInProcessViewHandlers)
  .build();

export default WithdrawalApprovalStreamFactory;

export type WithdrawalApprovalStreamType = typeof WithdrawalApprovalStreamFactory.StreamType;
