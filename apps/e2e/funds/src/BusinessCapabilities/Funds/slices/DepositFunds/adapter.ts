import { CommandHandlerOrchestratorFactory } from "#abstractions/commands/CommandHandlerOrchestratorFactory.js";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import type { CommandHandlerOrchestrator } from "#abstractions/commands/commandHandler.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleDeposit } from "./commandHandler.js";
import type { DepositFunds } from "./command.js";

export function createDepositAdapter(storageAdapter: IEvDbStorageAdapter): CommandHandlerOrchestrator<DepositFunds> {
  return CommandHandlerOrchestratorFactory.create(
    storageAdapter,
    FundsStreamFactory,
    (cmd) => cmd.accountId,
    handleDeposit,
  );
}
