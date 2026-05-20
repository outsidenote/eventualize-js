import type { PgBoss } from "pg-boss";
import type { AccountLeaderboardAdapter } from "../adapter.js";

export const LEADERBOARD_QUEUE = "event.FundsChanged.UpdateAccountLeaderboard";

interface JobData {
  metadata: { outboxId: string };
  payload: {
    accountId: string;
    currentBalance: number;
    delta: number;
    currency: string;
    transactionId: string;
  };
}

export async function registerLeaderboardWorker(
  boss: PgBoss,
  adapter: AccountLeaderboardAdapter,
): Promise<void> {
  await boss.createQueue(LEADERBOARD_QUEUE);

  await boss.work<JobData>(LEADERBOARD_QUEUE, async ([job]) => {
    const { payload } = job.data as JobData;
    await adapter({
      commandType: "UpdateAccountLeaderboard",
      accountId: payload.accountId,
      delta: payload.delta,
      currentBalance: payload.currentBalance,
      currency: payload.currency,
      transactionId: payload.transactionId,
    });
    console.log(`[Leaderboard/pgboss] account=${payload.accountId} balance=${payload.currentBalance}`);
  });

  console.log(`[Leaderboard/pgboss] worker registered for ${LEADERBOARD_QUEUE}`);
}
