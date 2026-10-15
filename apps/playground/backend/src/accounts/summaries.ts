import type { BalanceState } from "../domain/views.js";
import { NotFoundError } from "../errors.js";
import type { PlaygroundStorage } from "../storage.js";
import type { AccountHead } from "./getHead.js";
import { getHead } from "./getHead.js";

export const SUMMARY_CONCURRENCY = 8;

export type AccountSummary = {
  readonly id: string;
  readonly lastOffset: number;
  readonly balance: BalanceState;
  readonly risk: number;
};

/** Head state per account id. Ids without events (e.g. a race with deletion) are skipped. */
export async function listAccountSummaries(
  storage: PlaygroundStorage,
  listAccounts: () => Promise<string[]>,
): Promise<AccountSummary[]> {
  const ids = await listAccounts();
  const summaries: AccountSummary[] = [];
  for (let i = 0; i < ids.length; i += SUMMARY_CONCURRENCY) {
    const heads = await Promise.all(
      ids.slice(i, i + SUMMARY_CONCURRENCY).map((id) => headOrNull(storage, id)),
    );
    for (const h of heads) {
      if (h === null) continue;
      summaries.push({
        id: h.streamId,
        lastOffset: h.lastOffset,
        balance: h.views.balance,
        risk: h.views.risk,
      });
    }
  }
  return summaries;
}

async function headOrNull(storage: PlaygroundStorage, id: string): Promise<AccountHead | null> {
  try {
    return await getHead(storage, id);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
