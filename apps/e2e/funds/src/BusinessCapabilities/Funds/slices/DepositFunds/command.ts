import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface DepositFunds extends ICommand {
  readonly commandType: "DepositFunds";
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
}
