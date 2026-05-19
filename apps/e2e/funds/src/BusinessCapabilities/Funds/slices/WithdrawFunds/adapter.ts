import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleWithdraw } from "./commandHandler.js";
import type { WithdrawFunds } from "./command.js";

export function createWithdrawAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<WithdrawFunds> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (cmd) => cmd.accountId,
    handleWithdraw,
  );
}
