import type { CreditBatch, CreditLedgerEntry, CreditLedgerType, CreditSourceType } from "@zebragate/shared";
import type { CreditBatchRow, CreditLedgerRow } from "@zebragate/db";
import { getEnv } from "../config/env.js";
import { ensureProfile } from "./profiles.js";
import { getSupabaseAdminClient } from "./supabase.js";
import { ZebraGateApiError } from "../utils/errors.js";

export const DEFAULT_REGISTER_GIFT_CREDITS = 500;
export const DEFAULT_DAILY_CHECKIN_CREDITS = 20;
const CREDIT_EXPIRY_DAYS = 7;
const DAILY_CHECKIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface CreditConsumptionResult {
  consumedBatches: Array<{ batchId: string; amount: number }>;
  ledgerEntry: CreditLedgerEntry;
  remainingBalance: number;
}

export interface CreditGrantResult {
  batch: CreditBatch;
  ledgerEntry: CreditLedgerEntry;
  balance: number;
}

export interface ConsumeCreditsInput {
  userId: string;
  amount: number;
  requestId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CreditBatchRecord {
  id: string;
  userId: string;
  sourceType: CreditSourceType;
  originalCredits: number;
  remainingCredits: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreditLedgerRecord {
  id: string;
  userId: string;
  batchId: string | null;
  requestId: string | null;
  type: CreditLedgerType;
  sourceType: CreditSourceType | null;
  amount: number;
  balanceAfter: number;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface CreateCreditBatchInput {
  userId: string;
  sourceType: CreditSourceType;
  originalCredits: number;
  remainingCredits: number;
  expiresAt: string;
  createdAt: string;
}

export interface CreateCreditLedgerInput {
  userId: string;
  batchId?: string | null;
  requestId?: string | null;
  type: CreditLedgerType;
  sourceType?: CreditSourceType | null;
  amount: number;
  balanceAfter: number;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface CreditsRepository {
  ensureUserProfile(userId: string): Promise<void>;
  listCreditBatches(userId: string): Promise<CreditBatchRecord[]>;
  listCreditLedger(userId: string, limit: number): Promise<CreditLedgerRecord[]>;
  findCreditBatchBySourceType(userId: string, sourceType: CreditSourceType): Promise<CreditBatchRecord | null>;
  findLatestCreditLedgerBySourceType(
    userId: string,
    sourceType: CreditSourceType
  ): Promise<CreditLedgerRecord | null>;
  createCreditBatch(input: CreateCreditBatchInput): Promise<CreditBatchRecord>;
  createCreditLedger(input: CreateCreditLedgerInput): Promise<CreditLedgerRecord>;
  updateCreditBatchRemaining(batchId: string, remainingCredits: number): Promise<void>;
}

export interface CreditsServiceOptions {
  now?: () => Date;
  registerGiftCredits?: number;
  dailyCheckinCredits?: number;
}

export function isBatchActive(batch: CreditBatchRecord, now: Date): boolean {
  return batch.remainingCredits > 0 && (!batch.expiresAt || new Date(batch.expiresAt).getTime() > now.getTime());
}

export function calculateCreditBalance(batches: CreditBatchRecord[], now: Date): number {
  return batches
    .filter((batch) => isBatchActive(batch, now))
    .reduce((total, batch) => total + batch.remainingCredits, 0);
}

export function sortBatchesForConsumption(batches: CreditBatchRecord[]): CreditBatchRecord[] {
  return [...batches].sort((left, right) => {
    const leftExpiresAt = left.expiresAt ? new Date(left.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightExpiresAt = right.expiresAt ? new Date(right.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;

    if (leftExpiresAt !== rightExpiresAt) {
      return leftExpiresAt - rightExpiresAt;
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

export function createCreditsService(
  repository: CreditsRepository,
  options: CreditsServiceOptions = {}
) {
  const env = getEnv();
  const now = options.now ?? (() => new Date());
  const registerGiftCredits = options.registerGiftCredits ?? env.defaultRegisterGiftCredits;
  const dailyCheckinCredits = options.dailyCheckinCredits ?? env.defaultDailyCheckinCredits;

  async function getCreditBalance(userId: string, batchesLimit = 20): Promise<{
    balance: number;
    batches: CreditBatch[];
  }> {
    await repository.ensureUserProfile(userId);
    const batches = await repository.listCreditBatches(userId);
    const currentTime = now();
    const recentBatches = [...batches]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, batchesLimit);

    return {
      balance: calculateCreditBalance(batches, currentTime),
      batches: recentBatches.map(toCreditBatch)
    };
  }

  async function listCreditLedger(userId: string, limit = 20): Promise<CreditLedgerEntry[]> {
    await repository.ensureUserProfile(userId);
    const ledgerEntries = await repository.listCreditLedger(userId, limit);
    return ledgerEntries.map(toCreditLedgerEntry);
  }

  async function grantRegisterGift(userId: string): Promise<CreditGrantResult> {
    await repository.ensureUserProfile(userId);
    const existingBatch = await repository.findCreditBatchBySourceType(userId, "register_gift");

    if (existingBatch) {
      throw new ZebraGateApiError("BAD_REQUEST", "Register gift has already been claimed.", 409);
    }

    return grantCredits(userId, {
      amount: registerGiftCredits,
      sourceType: "register_gift",
      metadata: {
        reason: "register_gift"
      }
    });
  }

  async function grantDailyCheckin(userId: string): Promise<CreditGrantResult> {
    await repository.ensureUserProfile(userId);
    const latestCheckin = await repository.findLatestCreditLedgerBySourceType(userId, "daily_checkin");
    const currentTime = now();

    if (latestCheckin) {
      const elapsedMs = currentTime.getTime() - new Date(latestCheckin.createdAt).getTime();
      if (elapsedMs < DAILY_CHECKIN_COOLDOWN_MS) {
        throw new ZebraGateApiError("BAD_REQUEST", "Daily check-in has already been claimed in the last 24 hours.", 409);
      }
    }

    return grantCredits(userId, {
      amount: dailyCheckinCredits,
      sourceType: "daily_checkin",
      metadata: {
        reason: "daily_checkin"
      }
    });
  }

  async function consumeCreditsFifo(input: ConsumeCreditsInput): Promise<CreditConsumptionResult> {
    if (input.amount <= 0) {
      throw new ZebraGateApiError("BAD_REQUEST", "Credit consumption amount must be greater than 0.", 400);
    }

    await repository.ensureUserProfile(input.userId);
    const currentTime = now();
    const batches = await repository.listCreditBatches(input.userId);
    const activeBatches = sortBatchesForConsumption(batches.filter((batch) => isBatchActive(batch, currentTime)));
    const availableBalance = calculateCreditBalance(activeBatches, currentTime);

    if (availableBalance < input.amount) {
      throw new ZebraGateApiError("INSUFFICIENT_CREDITS", "Not enough credits available.", 400);
    }

    const consumedBatches: Array<{ batchId: string; amount: number }> = [];
    let remainingToConsume = input.amount;

    for (const batch of activeBatches) {
      if (remainingToConsume <= 0) {
        break;
      }

      const amountToConsume = Math.min(batch.remainingCredits, remainingToConsume);
      const nextRemainingCredits = batch.remainingCredits - amountToConsume;
      await repository.updateCreditBatchRemaining(batch.id, nextRemainingCredits);
      consumedBatches.push({ batchId: batch.id, amount: amountToConsume });
      remainingToConsume -= amountToConsume;
    }

    const remainingBalance = availableBalance - input.amount;
    const ledgerEntry = await repository.createCreditLedger({
      userId: input.userId,
      type: "debit",
      sourceType: null,
      requestId: input.requestId ?? null,
      amount: -input.amount,
      balanceAfter: remainingBalance,
      metadata: input.metadata ?? {},
      createdAt: currentTime.toISOString()
    });

    // TODO: MVP wrap batch updates and ledger creation in a database transaction or RPC.
    return {
      consumedBatches,
      ledgerEntry: toCreditLedgerEntry(ledgerEntry),
      remainingBalance
    };
  }

  async function grantCredits(
    userId: string,
    input: {
      amount: number;
      sourceType: CreditSourceType;
      metadata: Record<string, string | number | boolean | null>;
    }
  ): Promise<CreditGrantResult> {
    const currentTime = now();
    const existingBatches = await repository.listCreditBatches(userId);
    const currentBalance = calculateCreditBalance(existingBatches, currentTime);
    const createdAt = currentTime.toISOString();
    const expiresAt = addDays(currentTime, CREDIT_EXPIRY_DAYS).toISOString();

    const batch = await repository.createCreditBatch({
      userId,
      sourceType: input.sourceType,
      originalCredits: input.amount,
      remainingCredits: input.amount,
      expiresAt,
      createdAt
    });
    const nextBalance = currentBalance + input.amount;
    const ledgerEntry = await repository.createCreditLedger({
      userId,
      batchId: batch.id,
      type: "credit",
      sourceType: input.sourceType,
      amount: input.amount,
      balanceAfter: nextBalance,
      metadata: input.metadata,
      createdAt
    });

    return {
      batch: toCreditBatch(batch),
      ledgerEntry: toCreditLedgerEntry(ledgerEntry),
      balance: nextBalance
    };
  }

  return {
    getCreditBalance,
    grantRegisterGift,
    grantDailyCheckin,
    listCreditLedger,
    consumeCreditsFifo
  };
}

export async function getCreditBalance(userId: string, batchesLimit?: number) {
  return createCreditsService(createSupabaseCreditsRepository()).getCreditBalance(userId, batchesLimit);
}

export async function grantRegisterGift(userId: string) {
  return createCreditsService(createSupabaseCreditsRepository()).grantRegisterGift(userId);
}

export async function grantDailyCheckin(userId: string) {
  return createCreditsService(createSupabaseCreditsRepository()).grantDailyCheckin(userId);
}

export async function listCreditLedger(userId: string, limit = 20) {
  return createCreditsService(createSupabaseCreditsRepository()).listCreditLedger(userId, limit);
}

export async function consumeCreditsFifo(input: ConsumeCreditsInput) {
  return createCreditsService(createSupabaseCreditsRepository()).consumeCreditsFifo(input);
}

export function createSupabaseCreditsRepository(): CreditsRepository {
  return {
    async ensureUserProfile(userId: string): Promise<void> {
      await ensureProfile(userId, null);
    },

    async listCreditBatches(userId: string): Promise<CreditBatchRecord[]> {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("credit_batches")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return ((data ?? []) as CreditBatchRow[]).map(fromCreditBatchRow);
    },

    async listCreditLedger(userId: string, limit: number): Promise<CreditLedgerRecord[]> {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("credit_ledger")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return ((data ?? []) as CreditLedgerRow[]).map(fromCreditLedgerRow);
    },

    async findCreditBatchBySourceType(userId: string, sourceType: CreditSourceType): Promise<CreditBatchRecord | null> {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("credit_batches")
        .select("*")
        .eq("user_id", userId)
        .eq("source_type", sourceType)
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return data ? fromCreditBatchRow(data as CreditBatchRow) : null;
    },

    async findLatestCreditLedgerBySourceType(
      userId: string,
      sourceType: CreditSourceType
    ): Promise<CreditLedgerRecord | null> {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("credit_ledger")
        .select("*")
        .eq("user_id", userId)
        .eq("source_type", sourceType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return data ? fromCreditLedgerRow(data as CreditLedgerRow) : null;
    },

    async createCreditBatch(input: CreateCreditBatchInput): Promise<CreditBatchRecord> {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("credit_batches")
        .insert({
          user_id: input.userId,
          source_type: input.sourceType,
          original_credits: input.originalCredits,
          remaining_credits: input.remainingCredits,
          expires_at: input.expiresAt,
          created_at: input.createdAt
        })
        .select("*")
        .single();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return fromCreditBatchRow(data as CreditBatchRow);
    },

    async createCreditLedger(input: CreateCreditLedgerInput): Promise<CreditLedgerRecord> {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("credit_ledger")
        .insert({
          user_id: input.userId,
          batch_id: input.batchId ?? null,
          request_id: input.requestId ?? null,
          type: input.type,
          source_type: input.sourceType ?? null,
          amount: input.amount,
          balance_after: input.balanceAfter,
          metadata: input.metadata ?? {},
          created_at: input.createdAt
        })
        .select("*")
        .single();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return fromCreditLedgerRow(data as CreditLedgerRow);
    },

    async updateCreditBatchRemaining(batchId: string, remainingCredits: number): Promise<void> {
      const client = getSupabaseAdminClient();
      const { error } = await client
        .from("credit_batches")
        .update({ remaining_credits: remainingCredits })
        .eq("id", batchId);

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }
    }
  };
}

function fromCreditBatchRow(row: CreditBatchRow): CreditBatchRecord {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type as CreditSourceType,
    originalCredits: row.original_credits,
    remainingCredits: row.remaining_credits,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

function fromCreditLedgerRow(row: CreditLedgerRow): CreditLedgerRecord {
  return {
    id: row.id,
    userId: row.user_id,
    batchId: row.batch_id,
    requestId: row.request_id,
    type: row.type as CreditLedgerType,
    sourceType: row.source_type as CreditSourceType | null,
    amount: row.amount,
    balanceAfter: row.balance_after,
    metadata: toMetadataRecord(row.metadata),
    createdAt: row.created_at
  };
}

function toCreditBatch(record: CreditBatchRecord): CreditBatch {
  return {
    id: record.id,
    userId: record.userId,
    sourceType: record.sourceType,
    originalCredits: record.originalCredits,
    remainingCredits: record.remainingCredits,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt
  };
}

function toCreditLedgerEntry(record: CreditLedgerRecord): CreditLedgerEntry {
  return {
    id: record.id,
    userId: record.userId,
    batchId: record.batchId,
    requestId: record.requestId,
    type: record.type,
    sourceType: record.sourceType,
    amount: record.amount,
    balanceAfter: record.balanceAfter,
    metadata: record.metadata,
    createdAt: record.createdAt
  };
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function toMetadataRecord(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value);
  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [key, entryValue] of entries) {
    if (
      typeof entryValue === "string" ||
      typeof entryValue === "number" ||
      typeof entryValue === "boolean" ||
      entryValue === null
    ) {
      metadata[key] = entryValue;
    }
  }
  return metadata;
}
