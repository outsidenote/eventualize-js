import * as assert from "node:assert";
import { test, describe } from "node:test";
import express from "express";
import request from "supertest";
import { EvDbEventStoreBuilder } from "@eventualize/core/store/EvDbEventStoreBuilder";
import WithdrawalApprovalStreamFactory from "../eventstore/withdrawal-approval-stream/withdrawalApprovalStreamFactory.js";
import { createWithdrawalRouter } from "../routes/withdrawal.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.js";

function createTestApp() {
  const adapter = new InMemoryStorageAdapter();
  const eventStore = new EvDbEventStoreBuilder()
    .withAdapter(adapter)
    .withStreamFactory(WithdrawalApprovalStreamFactory)
    .build();

  const app = express();
  app.use(express.json());
  app.use("/api/withdrawals", createWithdrawalRouter(eventStore as any));
  return app;
}

describe("Withdrawal API — Behaviour Tests", () => {
  // ──────────────────────────────────────────────────────────────────
  // Scenario 1: Approve withdrawal with sufficient funds
  // ──────────────────────────────────────────────────────────────────
  test("POST /approve with sufficient funds returns FundsWithdrawalApproved", async (t) => {
    const app = createTestApp();

    await t.test("When: POST /approve with currentBalance=200, amount=20", async () => {
      const res = await request(app)
        .post("/api/withdrawals/approve")
        .send({
          account: "acc-001",
          amount: 20,
          currency: "USD",
          currentBalance: 200,
          session: "0011",
          source: "ATM",
          payer: "John Doe",
          transactionId: "txn-001",
          approvalDate: "2025-01-01T11:00:00Z",
          transactionTime: "2025-01-01T11:00:00Z",
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.event.payloadType, "FundsWithdrawalApproved");
      assert.strictEqual(res.body.event.account, "acc-001");
      assert.strictEqual(res.body.event.amount, 20);
      assert.strictEqual(res.body.event.currency, "USD");
      assert.strictEqual(res.body.streamId, "acc-001");
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 2: Decline withdrawal with insufficient funds
  // ──────────────────────────────────────────────────────────────────
  test("POST /approve with insufficient funds returns FundsWithdrawalDeclined", async (t) => {
    const app = createTestApp();

    await t.test("When: POST /approve with currentBalance=10, amount=20", async () => {
      const res = await request(app)
        .post("/api/withdrawals/approve")
        .send({
          account: "acc-002",
          amount: 20,
          currency: "USD",
          currentBalance: 10,
          session: "0022",
          source: "ATM",
          payer: "Jane Doe",
          transactionId: "txn-002",
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.event.payloadType, "FundsWithdrawalDeclined");
      assert.strictEqual(res.body.event.account, "acc-002");
      assert.strictEqual(res.body.event.amount, 20);
      assert.ok(
        res.body.event.reason.includes("Insufficient funds"),
        "Expected reason to mention insufficient funds",
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 3: Missing required fields returns 400
  // ──────────────────────────────────────────────────────────────────
  test("POST /approve with missing required fields returns 400", async (t) => {
    const app = createTestApp();

    await t.test("When: POST /approve without account", async () => {
      const res = await request(app)
        .post("/api/withdrawals/approve")
        .send({ amount: 20, currentBalance: 200 });

      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 4: GET returns WithdrawalsInProcess view after approval
  // ──────────────────────────────────────────────────────────────────
  test("GET /:streamId returns WithdrawalsInProcess view state after approval", async (t) => {
    const app = createTestApp();

    await t.test("Given: an approved withdrawal for acc-003", async () => {
      await request(app).post("/api/withdrawals/approve").send({
        account: "acc-003",
        amount: 50,
        currency: "EUR",
        currentBalance: 300,
        session: "sess-003",
        source: "ONLINE",
        payer: "Alice",
        transactionId: "txn-003",
        approvalDate: "2025-06-01T10:00:00Z",
        transactionTime: "2025-06-01T10:00:00Z",
      });
    });

    await t.test("When: GET /api/withdrawals/acc-003", async () => {
      const res = await request(app).get("/api/withdrawals/acc-003");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.streamId, "acc-003");
      assert.strictEqual(res.body.storedOffset, 1);
      assert.strictEqual(res.body.withdrawalsInProcess.account, "acc-003");
      assert.strictEqual(res.body.withdrawalsInProcess.amount, 50);
      assert.strictEqual(res.body.withdrawalsInProcess.currency, "EUR");
      assert.strictEqual(res.body.withdrawalsInProcess.session, "sess-003");
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 5: Multiple withdrawals on same account succeed
  // ──────────────────────────────────────────────────────────────────
  test("Multiple sequential withdrawals on the same account all succeed", async (t) => {
    const app = createTestApp();

    await t.test("When: first withdrawal for acc-004", async () => {
      const res = await request(app).post("/api/withdrawals/approve").send({
        account: "acc-004",
        amount: 10,
        currency: "USD",
        currentBalance: 500,
        session: "s1",
        source: "ATM",
        payer: "Bob",
        transactionId: "txn-004a",
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.event.payloadType, "FundsWithdrawalApproved");
    });

    await t.test("And: second withdrawal for the same account", async () => {
      const res = await request(app).post("/api/withdrawals/approve").send({
        account: "acc-004",
        amount: 20,
        currency: "USD",
        currentBalance: 490,
        session: "s2",
        source: "ATM",
        payer: "Bob",
        transactionId: "txn-004b",
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.event.payloadType, "FundsWithdrawalApproved");
    });

    await t.test("Then: storedOffset is 2", async () => {
      const res = await request(app).get("/api/withdrawals/acc-004");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.storedOffset, 2);
    });
  });
});
