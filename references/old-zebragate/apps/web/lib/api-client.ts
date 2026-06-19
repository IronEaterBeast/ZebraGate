import { mockApiRequestLogs } from "@zebragate/shared";
import type { CreditBatch, CreditLedgerEntry, UserProfile } from "@zebragate/shared";
import type { PublicAiOption } from "@zebragate/shared";
import { getSupabaseBrowserClient } from "./supabase-browser";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export interface DashboardPayload {
  balance: number;
  batches: CreditBatch[];
  ledger: CreditLedgerEntry[];
}

export async function getCurrentUser(): Promise<UserProfile> {
  return requestJson<{ user: UserProfile }>("/v1/me").then((response) => response.user);
}

export async function getCredits(): Promise<DashboardPayload> {
  const [balanceResponse, ledgerResponse] = await Promise.all([
    requestJson<{ balance: number; batches: CreditBatch[] }>("/v1/credits/balance"),
    requestJson<{ ledger: CreditLedgerEntry[] }>("/v1/credits/ledger")
  ]);

  return {
    balance: balanceResponse.balance,
    batches: balanceResponse.batches,
    ledger: ledgerResponse.ledger
  };
}

export async function claimRegisterGift() {
  return requestJson<{
    balance: number;
    batch: CreditBatch;
    ledgerEntry: CreditLedgerEntry;
  }>("/v1/credits/register-gift", { method: "POST" });
}

export async function claimDailyCheckin() {
  return requestJson<{
    balance: number;
    batch: CreditBatch;
    ledgerEntry: CreditLedgerEntry;
  }>("/v1/credits/checkin", { method: "POST" });
}

export async function getAiOptions(recommendedOnly = true): Promise<PublicAiOption[]> {
  const searchParams = new URLSearchParams({
    recommendedOnly: String(recommendedOnly)
  });

  return requestJson<{ aiOptions: PublicAiOption[] }>(`/v1/ai-options?${searchParams.toString()}`).then(
    (response) => response.aiOptions
  );
}

export async function getMockStats() {
  return {
    requestCount: mockApiRequestLogs.length,
    successRate: "96%",
    failureRate: "4%",
    budgetUsed: 80
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const client = getSupabaseBrowserClient();
  const session = (await client?.auth.getSession())?.data.session ?? null;

  const headers: Record<string, string> = {
    ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined)
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
      };
    };

    throw new Error(errorPayload.error?.message ?? "API request failed.");
  }

  return (await response.json()) as T;
}
