import type { Pool } from "pg";
import type { UpdateAccountLeaderboard } from "./command.js";

export async function handleUpdateLeaderboard(cmd: UpdateAccountLeaderboard, pool: Pool): Promise<void> {
  const isDeposit = cmd.delta > 0;
  const deposited = isDeposit ? cmd.delta : 0;
  const withdrawn = isDeposit ? 0 : Math.abs(cmd.delta);
  const depositCount = isDeposit ? 1 : 0;
  const withdrawalCount = isDeposit ? 0 : 1;

  await pool.query(
    `INSERT INTO account_leaderboard
       (account_id, currency, total_deposited, total_withdrawn, last_balance, deposit_count, withdrawal_count, last_activity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       total_deposited  = account_leaderboard.total_deposited  + $3,
       total_withdrawn  = account_leaderboard.total_withdrawn  + $4,
       last_balance     = $5,
       deposit_count    = account_leaderboard.deposit_count    + $6,
       withdrawal_count = account_leaderboard.withdrawal_count + $7,
       last_activity    = NOW()`,
    [cmd.accountId, cmd.currency, deposited, withdrawn, cmd.currentBalance, depositCount, withdrawalCount],
  );
}
