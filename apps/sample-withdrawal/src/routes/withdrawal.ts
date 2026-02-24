import { Router } from "express";
import type { Request, Response } from "express";
import { ApproveWithdrawal } from "../eventstore/withdrawal-approval-stream/commands/ApproveWithdrawal.js";
import { handleApproveWithdrawal } from "../eventstore/withdrawal-approval-stream/commands/commandHandler.js";
import type { WithdrawalApprovalStreamType } from "../eventstore/withdrawal-approval-stream/withdrawalApprovalStreamFactory.js";

type EventStore = {
  getStream(streamType: string, streamId: string): Promise<WithdrawalApprovalStreamType>;
};

export function createWithdrawalRouter(eventStore: EventStore): Router {
  const router = Router();

  router.post("/approve", async (req: Request, res: Response) => {
    try {
      const {
        account,
        amount,
        currency,
        currentBalance,
        session,
        source,
        payer,
        transactionId,
        approvalDate,
        transactionTime,
      } = req.body;

      if (!account || amount == null || currentBalance == null) {
        res.status(400).json({ error: "account, amount, and currentBalance are required" });
        return;
      }

      const stream = await eventStore.getStream("WithdrawalApprovalStream", account);

      const command = new ApproveWithdrawal({
        account,
        amount,
        approvalDate: approvalDate ? new Date(approvalDate) : new Date(),
        currency: currency ?? "USD",
        session: session ?? "api",
        source: source ?? "REST",
        payer: payer ?? "unknown",
        transactionId: transactionId ?? crypto.randomUUID(),
        transactionTime: transactionTime ? new Date(transactionTime) : new Date(),
        currentBalance,
      });

      handleApproveWithdrawal(stream, command);

      const event = stream.getEvents()[0];

      await stream.store();

      res.json({
        streamId: account,
        event: event?.payload,
      });
    } catch (err: any) {
      if (err.message === "OPTIMISTIC_CONCURRENCY_VIOLATION") {
        res.status(409).json({ error: "Conflict: stream was modified concurrently" });
        return;
      }
      console.error("POST /approve error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/:streamId", async (req: Request, res: Response) => {
    try {
      const stream = await eventStore.getStream(
        "WithdrawalApprovalStream",
        req.params.streamId as string,
      );

      res.json({
        streamId: req.params.streamId,
        storedOffset: stream.storedOffset,
        withdrawalsInProcess: stream.views.WithdrawalsInProcess.state,
      });
    } catch (err: any) {
      console.error("GET /:streamId error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
