import type { CommandHandler } from "#abstractions/commands/commandHandler.js";
import type { FundsStreamType } from "../../swimlanes/Funds/index.js";
import type { DepositFunds } from "./command.js";

export const handleDeposit: CommandHandler<FundsStreamType, DepositFunds> = (stream, command) => {
  stream.appendEventFundsDeposited({
    accountId: command.accountId,
    amount: command.amount,
    currency: command.currency,
  });
};
