import type {
  AiProviderPublicInfo,
  ApiRequestLog,
  CreditLedgerEntry,
  CreditBatch,
  UserProfile
} from "./types";
import { DAILY_CHECKIN_CREDITS, REGISTER_GIFT_CREDITS, ZEBRAGATE_MODEL } from "./constants";

export const mockUserProfile: UserProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "demo@zebragate.dev",
  displayName: "ZebraGate Demo User",
  avatarUrl: null,
  selectedProviderId: "provider-openai-mock",
  createdAt: "2026-06-09T00:00:00.000Z"
};

export const mockCreditBatches: CreditBatch[] = [
  {
    id: "batch-register-gift",
    userId: mockUserProfile.id,
    sourceType: "register_gift",
    originalCredits: REGISTER_GIFT_CREDITS,
    remainingCredits: 420,
    expiresAt: "2026-06-16T00:00:00.000Z",
    createdAt: "2026-06-09T00:00:00.000Z"
  },
  {
    id: "batch-checkin",
    userId: mockUserProfile.id,
    sourceType: "daily_checkin",
    originalCredits: DAILY_CHECKIN_CREDITS,
    remainingCredits: 20,
    expiresAt: "2026-06-16T08:00:00.000Z",
    createdAt: "2026-06-09T08:00:00.000Z"
  }
];

export const mockCreditLedgerEntries: CreditLedgerEntry[] = [
  {
    id: "ledger-1",
    userId: mockUserProfile.id,
    batchId: "batch-register-gift",
    amount: 500,
    balanceAfter: 500,
    type: "credit",
    sourceType: "register_gift",
    requestId: null,
    metadata: {
      reason: "register_gift"
    },
    note: "Register gift credits",
    createdAt: "2026-06-09T00:00:00.000Z"
  },
  {
    id: "ledger-2",
    userId: mockUserProfile.id,
    batchId: "batch-register-gift",
    amount: -80,
    balanceAfter: 420,
    type: "debit",
    sourceType: null,
    requestId: "req-mock-1",
    metadata: {
      reason: "mock_ai_request"
    },
    note: "Mock AI request",
    createdAt: "2026-06-09T09:30:00.000Z"
  }
];

export const mockProviders: AiProviderPublicInfo[] = [
  {
    id: "provider-openai-mock",
    displayName: "OpenAI Mirror Mock",
    model: ZEBRAGATE_MODEL,
    status: "healthy",
    creditMultiplier: 1,
    isEnabled: true,
    description: "Stable MVP mock provider for successful OpenAI-compatible responses."
  },
  {
    id: "provider-anthropic-mock",
    displayName: "Anthropic Mirror Mock",
    model: ZEBRAGATE_MODEL,
    status: "degraded",
    creditMultiplier: 1.2,
    isEnabled: true,
    description: "Alternative mock provider used to test retry and fallback behavior."
  },
  {
    id: "provider-disabled-mock",
    displayName: "Disabled Provider Mock",
    model: ZEBRAGATE_MODEL,
    status: "disabled",
    creditMultiplier: 1.5,
    isEnabled: false,
    description: "Disabled mock provider that should never enter an effective selection set."
  }
];

export const mockApiRequestLogs: ApiRequestLog[] = [
  {
    id: "req-mock-1",
    userId: mockUserProfile.id,
    providerId: "provider-openai-mock",
    status: "success",
    stream: false,
    creditsUsed: 80,
    latencyMs: 640,
    errorCode: null,
    retryTrace: [{ providerId: "provider-openai-mock", status: "success" }],
    metadata: {
      requestKind: "chat.completions"
    },
    createdAt: "2026-06-09T09:30:00.000Z"
  }
];
