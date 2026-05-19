import type { Request, Response } from "express";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { createWithdrawAdapter } from "../adapter.js";

export function createWithdrawHttpHandler(storageAdapter: IEvDbStorageAdapter) {
  const withdraw = createWithdrawAdapter(storageAdapter);

  return async (req: Request, res: Response) => {
    const { accountId, amount, currency } = req.body as Record<string, unknown>;
    if (!accountId || amount == null) {
      res.status(400).json({ error: "accountId and amount are required" });
      return;
    }
    try {
      const result = await withdraw({
        commandType: "WithdrawFunds",
        accountId: String(accountId),
        amount: Number(amount),
        currency: String(currency ?? "USD"),
      });
      res.json({ streamId: result.streamId, emittedEventTypes: result.events.map((e) => e.eventType) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "INSUFFICIENT_FUNDS") { res.status(422).json({ error: "Insufficient funds" }); return; }
      if (msg === "OPTIMISTIC_CONCURRENCY_VIOLATION") { res.status(409).json({ error: "Concurrent modification" }); return; }
      console.error("[WithdrawFunds] error:", err);
      res.status(500).json({ error: msg });
    }
  };
}
