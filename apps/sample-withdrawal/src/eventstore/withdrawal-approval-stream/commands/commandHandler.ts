import type { CommandHandler } from "../types/commandHandler.js";
import type { ApproveWithdrawal } from "./ApproveWithdrawal.js";
import { FundsWithdrawalApproved } from "../events/FundsWithdrawalApproved.js";
import { FundsWithdrawalDeclined } from "../events/FundsWithdrawalDeclined.js";
import type { WithdrawalApprovalStreamType } from "../withdrawalApprovalStreamFactory.js";
import { hasInsufficientEffectiveFunds } from "./specs.js";

/**
 * Command handler for the ApproveWithdrawal command.
 *
 * Decision logic driven by named spec predicates from the event model:
 * - hasInsufficientEffectiveFunds → emit FundsWithdrawalDeclined
 * - otherwise                     → emit FundsWithdrawalApproved
 */
export const handleApproveWithdrawal: CommandHandler<
  ApproveWithdrawal,
  WithdrawalApprovalStreamType
> = (stream, command) => {
  if (hasInsufficientEffectiveFunds(command)) {
    stream.appendEventFundsWithdrawalDeclined(
      new FundsWithdrawalDeclined({
        account: command.account,
        session: command.session,
        currency: command.currency,
        amount: command.amount,
        reason: `Insufficient funds: balance ${command.currentBalance} is less than withdrawal amount ${command.amount}`,
        payer: command.payer,
        source: command.source,
        transactionId: command.transactionId,
        declinedDate: new Date(),
      }),
    );
  } else {
    stream.appendEventFundsWithdrawalApproved(
      new FundsWithdrawalApproved({
        account: command.account,
        amount: command.amount,
        approvalDate: command.approvalDate,
        currency: command.currency,
        session: command.session,
        source: command.source,
        payer: command.payer,
        transactionId: command.transactionId,
      }),
    );
  }
};
