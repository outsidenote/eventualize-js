import type { Pool } from "pg";
import type { UpdateAccountLeaderboard } from "./command.js";
import { handleUpdateLeaderboard } from "./commandHandler.js";

export type AccountLeaderboardAdapter = (cmd: UpdateAccountLeaderboard) => Promise<void>;

export function createLeaderboardAdapter(pool: Pool): AccountLeaderboardAdapter {
  return (cmd) => handleUpdateLeaderboard(cmd, pool);
}
