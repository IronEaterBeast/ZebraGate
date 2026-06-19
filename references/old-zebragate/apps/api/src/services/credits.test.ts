import { describe, expect, it } from "vitest";
import type {
  CreateCreditBatchInput,
  CreateCreditLedgerInput,
  CreditBatchRecord,
  CreditLedgerRecord,
  CreditsRepository
} from "./credits.js";
import { createCreditsService } from "./credits.js";

class InMemoryCreditsRepository implements CreditsRepository {
  private readonly userIds = new Set<string>(["user-1"]);
  private readonly batches: CreditBatchRecord[] = [];
  private readonly ledger: CreditLedgerRecord[] = [];
  private batchSequence = 1;
  private ledgerSequence = 1;

  async ensureUserProfile(userId: string): Promise<void> {
    this.userIds.add(userId);
  }

  async listCreditBatches(userId: string): Promise<CreditBatchRecord[]> {
    return this.batches.filter((batch) => batch.userId === userId);
  }

  async listCreditLedger(userId: string, limit: number): Promise<CreditLedgerRecord[]> {
    return this.ledger
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async findCreditBatchBySourceType(userId: string, sourceType: CreditBatchRecord["sourceType"]): Promise<CreditBatchRecord | null> {
    return (
      this.batches
        .filter((batch) => batch.userId === userId && batch.sourceType === sourceType)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    );
  }

  async findLatestCreditLedgerBySourceType(
    userId: string,
    sourceType: CreditLedgerRecord["sourceType"] & string
  ): Promise<CreditLedgerRecord | null> {
    return (
      this.ledger
        .filter((entry) => entry.userId === userId && entry.sourceType === sourceType)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    );
  }

  async createCreditBatch(input: CreateCreditBatchInput): Promise<CreditBatchRecord> {
    const batch: CreditBatchRecord = {
      id: `batch-${this.batchSequence++}`,
      userId: input.userId,
      sourceType: input.sourceType,
      originalCredits: input.originalCredits,
      remainingCredits: input.remainingCredits,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt
    };
    this.batches.push(batch);
    return batch;
  }

  async createCreditLedger(input: CreateCreditLedgerInput): Promise<CreditLedgerRecord> {
    const ledgerEntry: CreditLedgerRecord = {
      id: `ledger-${this.ledgerSequence++}`,
      userId: input.userId,
      batchId: input.batchId ?? null,
      requestId: input.requestId ?? null,
      type: input.type,
      sourceType: input.sourceType ?? null,
      amount: input.amount,
      balanceAfter: input.balanceAfter,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt
    };
    this.ledger.push(ledgerEntry);
    return ledgerEntry;
  }

  async updateCreditBatchRemaining(batchId: string, remainingCredits: number): Promise<void> {
    const batch = this.batches.find((entry) => entry.id === batchId);
    if (!batch) {
      throw new Error(`Unknown batch ${batchId}`);
    }
    batch.remainingCredits = remainingCredits;
  }
}

describe("credits service", () => {
  it("returns zero balance when user has no active credits", async () => {
    const service = createCreditsService(new InMemoryCreditsRepository(), {
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });

    const result = await service.getCreditBalance("user-1");

    expect(result.balance).toBe(0);
    expect(result.batches).toHaveLength(0);
  });

  it("grants register gift and increases balance", async () => {
    const service = createCreditsService(new InMemoryCreditsRepository(), {
      now: () => new Date("2026-06-09T00:00:00.000Z"),
      registerGiftCredits: 500
    });

    const result = await service.grantRegisterGift("user-1");

    expect(result.balance).toBe(500);
    expect(result.batch.originalCredits).toBe(500);
    expect(result.ledgerEntry.amount).toBe(500);
  });

  it("rejects duplicate register gift claims", async () => {
    const service = createCreditsService(new InMemoryCreditsRepository(), {
      now: () => new Date("2026-06-09T00:00:00.000Z")
    });

    await service.grantRegisterGift("user-1");

    await expect(service.grantRegisterGift("user-1")).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
  });

  it("grants daily check-in and increases balance", async () => {
    const service = createCreditsService(new InMemoryCreditsRepository(), {
      now: () => new Date("2026-06-09T00:00:00.000Z"),
      dailyCheckinCredits: 20
    });

    const result = await service.grantDailyCheckin("user-1");

    expect(result.balance).toBe(20);
    expect(result.batch.originalCredits).toBe(20);
    expect(result.ledgerEntry.sourceType).toBe("daily_checkin");
  });

  it("rejects duplicate daily check-in inside 24 hours", async () => {
    const repository = new InMemoryCreditsRepository();
    let currentTime = new Date("2026-06-09T00:00:00.000Z");
    const service = createCreditsService(repository, {
      now: () => currentTime
    });

    await service.grantDailyCheckin("user-1");
    currentTime = new Date("2026-06-09T12:00:00.000Z");

    await expect(service.grantDailyCheckin("user-1")).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
  });

  it("consumes credits from the earliest expiring batches first", async () => {
    const repository = new InMemoryCreditsRepository();
    await repository.createCreditBatch({
      userId: "user-1",
      sourceType: "register_gift",
      originalCredits: 100,
      remainingCredits: 100,
      expiresAt: "2026-06-10T00:00:00.000Z",
      createdAt: "2026-06-09T00:00:00.000Z"
    });
    await repository.createCreditBatch({
      userId: "user-1",
      sourceType: "daily_checkin",
      originalCredits: 50,
      remainingCredits: 50,
      expiresAt: "2026-06-15T00:00:00.000Z",
      createdAt: "2026-06-09T01:00:00.000Z"
    });

    const service = createCreditsService(repository, {
      now: () => new Date("2026-06-09T02:00:00.000Z")
    });
    const result = await service.consumeCreditsFifo({
      userId: "user-1",
      amount: 120,
      requestId: "req-1"
    });

    expect(result.consumedBatches).toEqual([
      { batchId: "batch-1", amount: 100 },
      { batchId: "batch-2", amount: 20 }
    ]);
    expect(result.remainingBalance).toBe(30);
  });

  it("throws INSUFFICIENT_CREDITS when balance is too low", async () => {
    const repository = new InMemoryCreditsRepository();
    await repository.createCreditBatch({
      userId: "user-1",
      sourceType: "register_gift",
      originalCredits: 30,
      remainingCredits: 30,
      expiresAt: "2026-06-10T00:00:00.000Z",
      createdAt: "2026-06-09T00:00:00.000Z"
    });

    const service = createCreditsService(repository, {
      now: () => new Date("2026-06-09T02:00:00.000Z")
    });

    await expect(
      service.consumeCreditsFifo({
        userId: "user-1",
        amount: 50,
        requestId: "req-2"
      })
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS"
    });
  });

  it("rejects non-positive credit consumption amounts", async () => {
    const repository = new InMemoryCreditsRepository();
    await repository.createCreditBatch({
      userId: "user-1",
      sourceType: "register_gift",
      originalCredits: 30,
      remainingCredits: 30,
      expiresAt: "2026-06-10T00:00:00.000Z",
      createdAt: "2026-06-09T00:00:00.000Z"
    });

    const service = createCreditsService(repository, {
      now: () => new Date("2026-06-09T02:00:00.000Z")
    });

    await expect(
      service.consumeCreditsFifo({
        userId: "user-1",
        amount: 0,
        requestId: "req-3"
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
  });
});
