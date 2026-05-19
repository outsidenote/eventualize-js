import type { Request, Response } from "express";
import type { IEvDbStorageAdapter } from "@eventualize/core/adapters/IEvDbStorageAdapter";
import { createDepositAdapter } from "../adapter.js";

export function createDepositHttpHandler(storageAdapter: IEvDbStorageAdapter) {
  const deposit = createDepositAdapter(storageAdapter);

  return async (req: Request, res: Response) => {
    const { accountId, amount, currency } = req.body as Record<string, unknown>;
    if (!accountId || amount == null) {
      res.status(400).json({ error: "accountId and amount are required" });
      return;
    }
    try {
      const result = await deposit({
        commandType: "DepositFunds",
        accountId: String(accountId),
        amount: Number(amount),
        currency: String(currency ?? "USD"),
      });
      res.json({ streamId: result.streamId, emittedEventTypes: result.events.map((e) => e.eventType) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "OPTIMISTIC_CONCURRENCY_VIOLATION") { res.status(409).json({ error: "Concurrent modification" }); return; }
      console.error("[DepositFunds] error:", err);
      res.status(500).json({ error: msg });
    }
  };
}
