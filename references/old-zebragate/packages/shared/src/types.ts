export type ZebraGateErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INSUFFICIENT_CREDITS"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "INTERNAL_ERROR";

export type CreditSourceType =
  | "register_gift"
  | "daily_checkin"
  | "manual_grant"
  | "purchase"
  | "refund";

export type CreditLedgerType = "credit" | "debit" | "freeze" | "release";

export const PROVIDER_STATUS_VALUES = ["healthy", "degraded", "disabled", "unknown"] as const;

export type ProviderStatus = (typeof PROVIDER_STATUS_VALUES)[number];

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  selectedProviderId?: string | null;
  createdAt: string;
}

export interface CreditBatch {
  id: string;
  userId: string;
  sourceType: CreditSourceType;
  originalCredits: number;
  remainingCredits: number;
  expiresAt?: string | null;
  createdAt: string;
}

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  batchId?: string | null;
  amount: number;
  balanceAfter: number;
  type: CreditLedgerType;
  sourceType?: CreditSourceType | null;
  requestId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  note?: string | null;
  createdAt: string;
}

export interface ProviderConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  model: string;
  creditMultiplier: number;
  status: ProviderStatus;
  isEnabled: boolean;
}

export interface AiProviderPublicInfo {
  id: string;
  displayName: string;
  model: string;
  status: ProviderStatus;
  creditMultiplier: number;
  isEnabled: boolean;
  description?: string;
}

export interface PublicAiOption {
  aiOptionId: string;
  providerLabel: string;
  modelLabel: string;
  publicName: string;
  displayConfigSummary: string;
  displayBadges: unknown[];
  creditMultiplier: number;
  isRecommended: boolean;
  status: ProviderStatus;
  disableReason?: string | null;
  sortOrder: number;
}

export interface UserAiSelection {
  id: string;
  userId: string;
  providerId: string;
  createdAt: string;
}

export interface ApiRequestLog {
  id: string;
  userId?: string | null;
  providerId?: string | null;
  aiOptionId?: string | null;
  legacyRuntimePresetId?: string | null;
  modelId?: string | null;
  status: "success" | "error" | "blocked";
  stream: boolean;
  creditsUsed: number;
  latencyMs: number;
  errorCode?: ZebraGateErrorCode | null;
  retryTrace: Array<{
    providerId: string;
    status: "success" | "failed" | "timeout" | "skipped";
    error?: string;
  }>;
  metadata?: Record<string, string | number | boolean | null>;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AbuseRiskEvent {
  id: string;
  userId?: string | null;
  ipHash?: string | null;
  deviceId?: string | null;
  eventType: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface OpenAICompatibleChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface OpenAICompatibleChatRequest {
  model: string;
  messages: OpenAICompatibleChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  user?: string;
  ai_option_id?: string;
  ai_option_ids?: string[];
  zebragate_mock_behaviors?: Record<string, "success" | "fail" | "timeout">;
}

export interface OpenAICompatibleChatResponseChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason?: "stop" | null;
  }>;
}
