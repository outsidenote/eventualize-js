import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { RiskAssessmentAdapter } from "../adapter.js";

export function createRiskHttpHandler(adapter: RiskAssessmentAdapter) {
  return async (req: Request, res: Response) => {
    const { accountId, delta, currentBalance, currency, transactionId } = req.body as Record<string, unknown>;
    if (!accountId || delta == null || currentBalance == null) {
      res.status(400).json({ error: "accountId, delta, and currentBalance are required" });
      return;
    }
    try {
      await adapter({
        commandType: "UpdateAccountRisk",
        accountId: String(accountId),
        delta: Number(delta),
        currentBalance: Number(currentBalance),
        currency: String(currency ?? "USD"),
        transactionId: transactionId ? String(transactionId) : randomUUID(),
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[Risk] HTTP error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
