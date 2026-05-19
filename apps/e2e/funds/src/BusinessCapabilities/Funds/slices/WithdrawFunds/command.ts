import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface WithdrawFunds extends ICommand {
  readonly commandType: "WithdrawFunds";
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
}
