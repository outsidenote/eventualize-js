import * as assert from "node:assert";

import StorageAdapterStub from "./StorageAdapterStub.js";
import type { WithdrawalApprovalStreamType } from "../eventstore/withdrawal-approval-stream/withdrawalApprovalStreamFactory.js";
import WithdrawalApprovalStreamFactory from "../eventstore/withdrawal-approval-stream/withdrawalApprovalStreamFactory.js";
import { ApproveWithdrawal } from "../eventstore/withdrawal-approval-stream/commands/ApproveWithdrawal.js";
import { handleApproveWithdrawal } from "../eventstore/withdrawal-approval-stream/commands/commandHandler.js";
import type { FundsWithdrawalApproved } from "../eventstore/withdrawal-approval-stream/events/FundsWithdrawalApproved.js";
import type { FundsWithdrawalDeclined } from "../eventstore/withdrawal-approval-stream/events/FundsWithdrawalDeclined.js";
import { EvDbEventStoreBuilder } from "@eventualize/core/store/EvDbEventStoreBuilder";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbPrismaStorageAdmin from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdmin";
import type { PrismaClient as PostgresPrismaClient } from "@eventualize/postgres-storage-adapter/generated/prisma/client";

export enum EVENT_STORE_TYPE {
  STUB = "Stub",
  POSTGRES = "Postgres",
}

type StoreClientType = PostgresPrismaClient<never, any, any> | undefined;

export default class Steps {
  public static createStoreClient(
    storeType: EVENT_STORE_TYPE,
    connectionString?: string,
  ): StoreClientType {
    switch (storeType) {
      case EVENT_STORE_TYPE.POSTGRES:
        return EvDbPostgresPrismaClientFactory.create(connectionString);
      case EVENT_STORE_TYPE.STUB:
      default:
        return undefined;
    }
  }

  public static createEventStore(storeClient?: StoreClientType, storeType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB) {
    const storageAdapter =
      storeType === EVENT_STORE_TYPE.POSTGRES
        ? new EvDbPrismaStorageAdapter(storeClient)
        : new StorageAdapterStub();

    const eventstore = new EvDbEventStoreBuilder()
      .withAdapter(storageAdapter)
      .withStreamFactory(WithdrawalApprovalStreamFactory)
      .build();

    return eventstore;
  }

  public static createWithdrawalStream(
    streamId: string,
    eventStore: ReturnType<typeof Steps.createEventStore>,
  ): WithdrawalApprovalStreamType {
    return eventStore.createWithdrawalApprovalStream(streamId) as WithdrawalApprovalStreamType;
  }

  public static async clearEnvironment(
    storeClient: StoreClientType,
    storeType: EVENT_STORE_TYPE = EVENT_STORE_TYPE.STUB,
  ): Promise<void> {
    if (storeType === EVENT_STORE_TYPE.POSTGRES && storeClient) {
      const admin = new EvDbPrismaStorageAdmin(storeClient);
      await admin.clearEnvironmentAsync();
      await admin.close();
    }
  }

  // ──────────────────────────────────────────────
  // Commands
  // ──────────────────────────────────────────────

  public static approveWithdrawalWithSufficientFunds(stream: WithdrawalApprovalStreamType): void {
    const command = new ApproveWithdrawal({
      account: "1234",
      amount: 20,
      approvalDate: new Date("2025-01-01T11:00:00Z"),
      currency: "USD",
      session: "0011",
      source: "ATM",
      payer: "John Doe",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
      currentBalance: 200,
    });
    handleApproveWithdrawal(stream, command);
  }

  public static approveWithdrawalWithInsufficientFunds(stream: WithdrawalApprovalStreamType): void {
    const command = new ApproveWithdrawal({
      account: "1234",
      amount: 20,
      approvalDate: new Date("2025-01-01T11:00:00Z"),
      currency: "USD",
      session: "0011",
      source: "ATM",
      payer: "John Doe",
      transactionId: "0011",
      transactionTime: new Date("2025-01-01T11:00:00Z"),
      currentBalance: 10,
    });
    handleApproveWithdrawal(stream, command);
  }

  // ──────────────────────────────────────────────
  // Assertions
  // ──────────────────────────────────────────────

  public static assertWithdrawalApproved(stream: WithdrawalApprovalStreamType): void {
    const events = stream.getEvents();
    assert.strictEqual(events.length, 1, "Expected exactly 1 event");

    const payload = events[0].payload as FundsWithdrawalApproved;
    assert.strictEqual(payload.payloadType, "FundsWithdrawalApproved");
    assert.strictEqual(payload.amount, 20);
    assert.strictEqual(payload.account, "1234");
    assert.strictEqual(payload.currency, "USD");
    assert.strictEqual(payload.payer, "John Doe");
    assert.strictEqual(payload.source, "ATM");
    assert.strictEqual(payload.transactionId, "0011");
  }

  public static assertWithdrawalDeclined(stream: WithdrawalApprovalStreamType): void {
    const events = stream.getEvents();
    assert.strictEqual(events.length, 1, "Expected exactly 1 event");

    const payload = events[0].payload as FundsWithdrawalDeclined;
    assert.strictEqual(payload.payloadType, "FundsWithdrawalDeclined");
    assert.strictEqual(payload.amount, 20);
    assert.strictEqual(payload.account, "1234");
    assert.strictEqual(payload.currency, "USD");
    assert.strictEqual(payload.payer, "John Doe");
    assert.strictEqual(payload.source, "ATM");
    assert.ok(
      payload.reason.includes("Insufficient funds"),
      "Expected decline reason to mention insufficient funds",
    );
  }

  public static assertMessagesProduced(stream: WithdrawalApprovalStreamType, expectedCount: number): void {
    const messages = stream.getMessages();
    assert.strictEqual(messages.length, expectedCount, `Expected ${expectedCount} messages`);
  }

  public static compareFetchedAndStoredStreams(
    storedStream: WithdrawalApprovalStreamType,
    fetchedStream: WithdrawalApprovalStreamType,
  ): void {
    assert.strictEqual(fetchedStream.getEvents().length, 0);
    assert.strictEqual(fetchedStream.storedOffset, storedStream.storedOffset);
  }
}
