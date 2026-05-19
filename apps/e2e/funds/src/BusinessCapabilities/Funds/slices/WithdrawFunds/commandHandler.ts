import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import type { WithdrawFunds } from "./command.js";

export const handleWithdraw: CommandHandler<FundsStreamType, WithdrawFunds> = (stream, command) => {
  if (stream.views.balance < command.amount) {
    throw new Error("INSUFFICIENT_FUNDS");
  }
  stream.appendEventFundsWithdrawn({
    accountId: command.accountId,
    amount: command.amount,
    currency: command.currency,
  });
};
