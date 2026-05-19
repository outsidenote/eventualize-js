import type { Collection } from "mongodb";
import type { UpdateAccountRisk } from "./command.js";

export type RiskLevel = "none" | "low" | "medium" | "high";

type TxEntry = { delta: number; transactionId: string; recordedAt: Date };

export interface AccountRiskDoc {
  accountId: string;
  transactions: TxEntry[];
  riskLevel: RiskLevel;
  currentBalance: number;
  assessedAt: Date;
}

export function computeRiskLevel(transactions: Array<{ delta: number }>, currentBalance: number): RiskLevel {
  if (transactions.length < 10) return "none";
  const avgDelta = transactions.reduce((sum, t) => sum + t.delta, 0) / transactions.length;
  if (avgDelta >= 0) return "low";
  const stepsToZero = currentBalance / Math.abs(avgDelta);
  if (stepsToZero > 20) return "low";
  if (stepsToZero > 10) return "medium";
  return "high";
}

export async function handleUpdateRisk(cmd: UpdateAccountRisk, collection: Collection<AccountRiskDoc>): Promise<void> {
  const existing = await collection.findOne({ accountId: cmd.accountId });
  const prev: TxEntry[] = existing?.transactions ?? [];

  const transactions: TxEntry[] = [
    { delta: cmd.delta, transactionId: cmd.transactionId, recordedAt: new Date() },
    ...prev,
  ].slice(0, 10);

  const riskLevel = computeRiskLevel(transactions, cmd.currentBalance);

  await collection.updateOne(
    { accountId: cmd.accountId },
    {
      $set: {
        accountId: cmd.accountId,
        transactions,
        riskLevel,
        currentBalance: cmd.currentBalance,
        assessedAt: new Date(),
      },
    },
    { upsert: true },
  );
}
