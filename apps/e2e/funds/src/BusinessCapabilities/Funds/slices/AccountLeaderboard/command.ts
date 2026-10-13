import type { ICommand } from "#abstractions/commands/ICommand.js";

export interface UpdateAccountLeaderboard extends ICommand {
  readonly commandType: "UpdateAccountLeaderboard";
  readonly accountId: string;
  readonly delta: number;
  readonly currentBalance: number;
  readonly currency: string;
  readonly transactionId: string;
}
