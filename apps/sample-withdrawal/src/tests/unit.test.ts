import * as assert from "node:assert";
import { test, describe } from "node:test";
import Steps from "./steps.js";
import { ApproveWithdrawal } from "../eventstore/withdrawal-approval-stream/commands/ApproveWithdrawal.js";
import { handleApproveWithdrawal } from "../eventstore/withdrawal-approval-stream/commands/commandHandler.js";
import type { WithdrawalApprovalStreamType } from "../eventstore/withdrawal-approval-stream/withdrawalApprovalStreamFactory.js";
import type { FundsWithdrawalApproved } from "../eventstore/withdrawal-approval-stream/events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../eventstore/withdrawal-approval-stream/events/FundsWithdrawalDeclined.js";

interface TestContext {
  eventStore: ReturnType<typeof Steps.createEventStore>;
  stream: WithdrawalApprovalStreamType;
}

describe("Withdrawal Approval Slice - Unit Tests", () => {
  // ──────────────────────────────────────────────────────────────────
  // Scenario 1: Withdrawal Approved (sufficient funds)
  // ──────────────────────────────────────────────────────────────────
  test("Approve withdrawal when balance is sufficient", async (t) => {
    const ctx: Partial<TestContext> = {};

    await t.test("Given: an empty withdrawal approval stream", () => {
      ctx.eventStore = Steps.createEventStore();
      ctx.stream = Steps.createWithdrawalStream("account-1234", ctx.eventStore);
    });

    await t.test("When: ApproveWithdrawal command is issued with currentBalance=200, amount=20", () => {
      Steps.approveWithdrawalWithSufficientFunds(ctx.stream!);
    });

    await t.test("Then: a FundsWithdrawalApproved event is emitted", () => {
      Steps.assertWithdrawalApproved(ctx.stream!);
    });

    await t.test("And: a withdrawal approved notification message is produced", () => {
      Steps.assertMessagesProduced(ctx.stream!, 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 2: Withdrawal Declined (insufficient funds)
  // ──────────────────────────────────────────────────────────────────
  test("Decline withdrawal when balance is insufficient", async (t) => {
    const ctx: Partial<TestContext> = {};

    await t.test("Given: an empty withdrawal approval stream", () => {
      ctx.eventStore = Steps.createEventStore();
      ctx.stream = Steps.createWithdrawalStream("account-1234", ctx.eventStore);
    });

    await t.test("When: ApproveWithdrawal command is issued with currentBalance=10, amount=20", () => {
      Steps.approveWithdrawalWithInsufficientFunds(ctx.stream!);
    });

    await t.test("Then: a FundsWithdrawalDeclined event is emitted with reason", () => {
      Steps.assertWithdrawalDeclined(ctx.stream!);
    });

    await t.test("And: a withdrawal declined notification message is produced", () => {
      Steps.assertMessagesProduced(ctx.stream!, 1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 3: Exact balance withdrawal (edge case)
  // ──────────────────────────────────────────────────────────────────
  test("Approve withdrawal when balance equals withdrawal amount exactly", async (t) => {
    const ctx: Partial<TestContext> = {};

    await t.test("Given: an empty withdrawal approval stream", () => {
      ctx.eventStore = Steps.createEventStore();
      ctx.stream = Steps.createWithdrawalStream("account-5678", ctx.eventStore);
    });

    await t.test("When: ApproveWithdrawal command is issued with currentBalance=20, amount=20", () => {
      const command = new ApproveWithdrawal({
        account: "5678",
        amount: 20,
        approvalDate: new Date("2025-01-01T11:00:00Z"),
        currency: "USD",
        session: "0022",
        source: "ATM",
        payer: "Jane Doe",
        transactionId: "0022",
        transactionTime: new Date("2025-01-01T11:00:00Z"),
        currentBalance: 20,
      });
      handleApproveWithdrawal(ctx.stream!, command);
    });

    await t.test("Then: a FundsWithdrawalApproved event is emitted (balance == amount is sufficient)", () => {
      const events = ctx.stream!.getEvents();
      assert.strictEqual(events.length, 1);

      const payload = events[0].payload as FundsWithdrawalApproved;
      assert.strictEqual(payload.payloadType, "FundsWithdrawalApproved");
      assert.strictEqual(payload.amount, 20);
      assert.strictEqual(payload.account, "5678");
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Scenario 4: Insufficient Effective Funds Withdrawals (from spec)
  //   WHEN: ApproveWithdrawal { Account:123, Amount:100, CurrentBalance:50 }
  //   THEN: FundsWithdrawalDeclined
  // ──────────────────────────────────────────────────────────────────
  test("Insufficient Effective Funds Withdrawals", async (t) => {
    const ctx: Partial<TestContext> = {};

    await t.test("Given: an empty withdrawal approval stream for account 123", () => {
      ctx.eventStore = Steps.createEventStore();
      ctx.stream = Steps.createWithdrawalStream("account-123", ctx.eventStore);
    });

    await t.test("When: ApproveWithdrawal command is issued with Account=123, Amount=100, CurrentBalance=50", () => {
      const command = new ApproveWithdrawal({
        account: "123",
        amount: 100,
        approvalDate: new Date("2025-01-01T11:00:00Z"),
        currency: "USD",
        session: "0011",
        source: "ATM",
        payer: "John Doe",
        transactionId: "0011",
        transactionTime: new Date("2025-01-01T11:00:00Z"),
        currentBalance: 50,
      });
      handleApproveWithdrawal(ctx.stream!, command);
    });

    await t.test("Then: a FundsWithdrawalDeclined event is emitted", () => {
      const events = ctx.stream!.getEvents();
      assert.strictEqual(events.length, 1);

      const payload = events[0].payload as FundsWithdrawalDeclined;
      assert.strictEqual(payload.payloadType, "FundsWithdrawalDeclined");
      assert.strictEqual(payload.account, "123");
      assert.strictEqual(payload.amount, 100);
      assert.ok(
        payload.reason.includes("Insufficient funds"),
        "Expected decline reason to mention insufficient funds",
      );
    });

    await t.test("And: a withdrawal declined notification message is produced", () => {
      Steps.assertMessagesProduced(ctx.stream!, 1);
    });
  });
});
