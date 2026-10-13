import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface UpdateAccountRisk extends ICommand {
  readonly commandType: "UpdateAccountRisk";
  readonly accountId: string;
  readonly delta: number;
  readonly currentBalance: number;
  readonly currency: string;
  readonly transactionId: string;
}
