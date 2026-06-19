import { randomUUID } from "node:crypto";
import type { ApiRequestLog, OpenAICompatibleChatRequest, OpenAICompatibleChatResponseChunk, ZebraGateErrorCode } from "@zebragate/shared";
import {
  checkBudget,
  checkConcurrency,
  checkContextLimit,
  checkOutputLimit,
  checkRateLimit,
  type AbuseGuardContext
} from "./abuse-guard.js";
import { consumeCreditsFifo, getCreditBalance } from "./credits.js";
import {
  createSupabaseProviderRepository,
  type InternalAiProvider,
  type ResolvedAiOptionExecutionConfig
} from "./providers.js";
import { createSupabaseAiTraceRepository, type CreateAiTraceEventInput } from "./ai-traces.js";
import { summarizeSseStreamSummaryForTrace } from "./sse-stream-summary.js";
import { getSupabaseAdminClient } from "./supabase.js";
import {
  buildUpstreamRequestBody,
  executeUpstreamProvider,
  type UpstreamExecutionMetadata,
  type UpstreamExecutionSuccess
} from "./upstream-proxy.js";
import { ZebraGateApiError } from "../utils/errors.js";

export type { ResolvedAiOptionExecutionConfig } from "./providers.js";

export interface OpenAiGatewayRequestContext {
  userId: string;
  ip?: string;
  deviceId?: string;
  traceId?: string;
  request: OpenAICompatibleChatRequest;
}

export interface OpenAiGatewaySuccessResult {
  requestId: string;
  providerId: string;
  stream: boolean;
  creditsUsed: number;
  retryTrace: ApiRequestLog["retryTrace"];
  completion?: unknown;
  chunks?: OpenAICompatibleChatResponseChunk[];
  streamBody?: ReadableStream<Uint8Array>;
  finalizeStream?: () => Promise<void>;
}

export interface OpenAiGatewayDependencies {
  getCreditBalance(userId: string): Promise<{ balance: number }>;
  consumeCredits(input: {
    userId: string;
    amount: number;
    requestId: string;
    metadata: Record<string, string | number | boolean | null>;
  }): Promise<void>;
  writeRequestLog(input: CreateApiRequestLogInput): Promise<void>;
  resolveAiOption(aiOptionId: string): Promise<ResolvedAiOptionExecutionConfig | null>;
  getProviders(): Promise<InternalAiProvider[]>;
  executeProvider(
    provider: InternalAiProvider,
    request: OpenAICompatibleChatRequest,
    aiOption: ResolvedAiOptionExecutionConfig
  ): Promise<UpstreamExecutionSuccess>;
  random(): number;
  now(): Date;
  reportLogWriteFailure?(input: {
    error: unknown;
    requestId: string;
    userId: string;
    providerId: string | null;
    status: "success" | "error" | "blocked";
  }): void;
  writeTraceEvent?(input: CreateAiTraceEventInput): Promise<void>;
}

export interface CreateApiRequestLogInput {
  userId: string;
  providerId: string | null;
  aiOptionId?: string | null;
  legacyRuntimePresetId?: string | null;
  modelId?: string | null;
  status: "success" | "error" | "blocked";
  stream: boolean;
  creditsUsed: number;
  latencyMs: number;
  errorCode: ZebraGateErrorCode | null;
  errorMessage?: string | null;
  retryTrace: ApiRequestLog["retryTrace"];
  metadata: Record<string, string | number | boolean | null>;
  requestPayload?: unknown;
  responsePayload?: unknown;
  createdAt: string;
}

export type ProviderSource = "request" | "default_fallback";

export interface AiOptionExecutionCandidate {
  provider: InternalAiProvider;
  aiOption: ResolvedAiOptionExecutionConfig;
}

export function createOpenAiGatewayService(
  dependencies: OpenAiGatewayDependencies
) {
  async function handleChatCompletion(
    context: OpenAiGatewayRequestContext
  ): Promise<OpenAiGatewaySuccessResult> {
    const requestStartedAt = dependencies.now();
    const requestId = randomUUID();
    const stream = Boolean(context.request.stream);
    const providerSource = getProviderSourceFromRequest(context.request);
    const abuseContext: AbuseGuardContext = {
      userId: context.userId,
      ip: context.ip,
      deviceId: context.deviceId,
      messageCount: context.request.messages.length,
      maxTokens: context.request.max_tokens
    };

    const [rateLimitAllowed, budgetAllowed, concurrencyAllowed, contextAllowed, outputAllowed] =
      await Promise.all([
        checkRateLimit(abuseContext),
        checkBudget(abuseContext),
        checkConcurrency(abuseContext),
        checkContextLimit(abuseContext),
        checkOutputLimit(abuseContext)
      ]);

    if (!rateLimitAllowed || !budgetAllowed || !concurrencyAllowed || !contextAllowed || !outputAllowed) {
      const error = new ZebraGateApiError("RATE_LIMITED", "Blocked by ZebraGate safety and budget checks.", 429);
      await writeFailureLog({
        requestId,
        startedAt: requestStartedAt,
        userId: context.userId,
        stream,
        retryTrace: [],
        providerId: null,
        providerSource,
        requestPayload: redactRequestPayloadForLogging(context.request),
        error
      });
      throw error;
    }

    const balance = await dependencies.getCreditBalance(context.userId);
    if (balance.balance <= 0) {
      const error = new ZebraGateApiError("INSUFFICIENT_CREDITS", "Not enough credits available.", 400);
      await writeFailureLog({
        requestId,
        startedAt: requestStartedAt,
        userId: context.userId,
        stream,
        retryTrace: [],
        providerId: null,
        providerSource,
        requestPayload: redactRequestPayloadForLogging(context.request),
        error
      });
      throw error;
    }

    const candidatePool = await resolveAiOptionPool(context.request.ai_option_ids, providerSource);
    const retryTrace: ApiRequestLog["retryTrace"] = [];
    let lastAttemptedProviderId: string | null = null;
    let lastError: unknown = null;

    for (const candidate of shuffleCandidates(candidatePool, dependencies.random)) {
      const { provider, aiOption } = candidate;
      lastAttemptedProviderId = provider.id;
      let execution: UpstreamExecutionSuccess;
      const upstreamRequestBody = buildUpstreamRequestBody(context.request, aiOption);

      await safeWriteTraceEvent({
        traceId: context.traceId,
        userId: context.userId,
        deviceId: context.deviceId ?? null,
        entrypoint: "desktop_local_proxy",
        requestKind: "chat.completions",
        clientRequestModel: context.request.model,
        resolvedAiOptionId: aiOption.aiOptionId,
        resolvedModelId: aiOption.modelId,
        resolvedUpstreamModel: aiOption.upstreamModel,
        providerId: provider.id,
        isStream: stream,
        stage: "server_to_ai",
        direction: "outbound",
        component: "api",
        status: "started",
        payloadJson: redactRequestPayloadForLogging(upstreamRequestBody),
        payloadPreviewText: summarizeJsonForTrace(upstreamRequestBody),
        metadataJson: {
          requestId,
          attempt: retryTrace.length + 1
        }
      });

      try {
        execution = await dependencies.executeProvider(provider, context.request, aiOption);
      } catch (error) {
        lastError = error;
        retryTrace.push({
          providerId: provider.id,
          status: getRetryStatus(error),
          error: error instanceof Error ? error.message : "Unknown provider error"
        });
        await safeWriteTraceEvent({
          traceId: context.traceId,
          userId: context.userId,
          deviceId: context.deviceId ?? null,
          entrypoint: "desktop_local_proxy",
          requestKind: "chat.completions",
          clientRequestModel: context.request.model,
          resolvedAiOptionId: aiOption.aiOptionId,
          resolvedModelId: aiOption.modelId,
          resolvedUpstreamModel: aiOption.upstreamModel,
          providerId: provider.id,
          isStream: stream,
          stage: "ai_to_server",
          direction: "inbound",
          component: "upstream_ai",
          status: "error",
          errorCode: error instanceof ZebraGateApiError ? error.code : "PROVIDER_UNAVAILABLE",
          errorMessage: error instanceof Error ? error.message : "Unknown provider error",
          metadataJson: {
            requestId,
            attempt: retryTrace.length
          }
        });
        continue;
      }

      if (execution.stream) {
        return {
          requestId,
          providerId: provider.id,
          stream: true,
          creditsUsed: 0,
          retryTrace,
          streamBody: execution.streamBody,
          finalizeStream: async () => {
            const finalized = await execution.finalize();
            await finalizeSuccessfulExecution({
              requestId,
              requestStartedAt,
              context,
              provider,
              aiOption,
              providerSource,
              stream: true,
              creditsToCharge: finalized.creditsToCharge,
              retryTrace,
              executionMetadata: finalized.metadata,
              responsePayload: null
            });
          }
        };
      }

      await finalizeSuccessfulExecution({
        requestId,
        requestStartedAt,
        context,
        provider,
        aiOption,
        providerSource,
        stream: false,
        creditsToCharge: execution.creditsToCharge,
        retryTrace,
        executionMetadata: execution.metadata,
        responsePayload: execution.completion
      });

      return {
        requestId,
        providerId: provider.id,
        stream,
        creditsUsed: execution.creditsToCharge,
        retryTrace,
        completion: execution.completion
      };
    }

    const finalError = new ZebraGateApiError(
      "PROVIDER_UNAVAILABLE",
      "All selected AI options failed for this request.",
      503
    );
    await writeFailureLog({
      requestId,
      startedAt: requestStartedAt,
      userId: context.userId,
      stream,
      retryTrace,
      providerId: lastAttemptedProviderId,
      providerSource,
      requestPayload: redactRequestPayloadForLogging(context.request),
      error: finalError,
      cause: lastError
    });
    throw finalError;
  }

  async function writeFailureLog(input: {
    requestId: string;
    startedAt: Date;
    userId: string;
    stream: boolean;
    retryTrace: ApiRequestLog["retryTrace"];
    providerId: string | null;
    providerSource?: ProviderSource;
    requestPayload?: unknown;
    error: ZebraGateApiError;
    cause?: unknown;
  }): Promise<void> {
    const latencyMs = dependencies.now().getTime() - input.startedAt.getTime();
    const causeMessage = input.cause instanceof Error ? input.cause.message : null;

    await safeWriteRequestLog({
      userId: input.userId,
      providerId: input.providerId,
      status: input.error.code === "RATE_LIMITED" ? "blocked" : "error",
      stream: input.stream,
      creditsUsed: 0,
      latencyMs,
      errorCode: input.error.code,
      errorMessage: causeMessage ?? input.error.message,
      retryTrace: input.retryTrace,
      requestPayload: input.requestPayload,
      metadata: {
        requestId: input.requestId,
        requestKind: "chat.completions",
        providerId: input.providerId ?? "",
        providerSource: input.providerSource ?? null
      },
      createdAt: dependencies.now().toISOString()
    });
  }

  async function resolveAiOptionPool(
    requestedAiOptionIds: string[] | undefined,
    providerSource: ProviderSource
  ): Promise<AiOptionExecutionCandidate[]> {
    if (providerSource !== "request" || !requestedAiOptionIds || requestedAiOptionIds.length === 0) {
      throw new ZebraGateApiError(
        "BAD_REQUEST",
        "Requested ai_option_ids cannot be empty.",
        400
      );
    }

    const providers = await dependencies.getProviders();
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));

    const candidates: AiOptionExecutionCandidate[] = [];
    for (const aiOptionId of requestedAiOptionIds) {
      const aiOption = await dependencies.resolveAiOption(aiOptionId);
      if (!aiOption) {
        continue;
      }

      const provider = providerById.get(aiOption.providerId);
      if (!provider) {
        continue;
      }

      candidates.push({ provider, aiOption });
    }

    if (candidates.length === 0) {
      throw new ZebraGateApiError(
        "PROVIDER_UNAVAILABLE",
        "Requested ai_option_ids are unavailable.",
        503
      );
    }

    return candidates;
  }

  async function safeWriteRequestLog(input: CreateApiRequestLogInput): Promise<void> {
    try {
      await dependencies.writeRequestLog(input);
    } catch (error) {
      dependencies.reportLogWriteFailure?.({
        error,
        requestId: typeof input.metadata.requestId === "string" ? input.metadata.requestId : "unknown",
        userId: input.userId,
        providerId: input.providerId,
        status: input.status
      });
    }
  }

  async function safeWriteTraceEvent(input: Omit<CreateAiTraceEventInput, "traceId"> & { traceId?: string }): Promise<void> {
    if (!input.traceId || !dependencies.writeTraceEvent) {
      return;
    }

    try {
      await dependencies.writeTraceEvent({
        ...input,
        traceId: input.traceId
      });
    } catch (error) {
      console.error("ZebraGate trace event write failed.", {
        traceId: input.traceId,
        stage: input.stage,
        status: input.status,
        error: error instanceof Error ? error.message : "Unknown trace write error"
      });
    }
  }

  async function finalizeSuccessfulExecution(input: {
    requestId: string;
    requestStartedAt: Date;
    context: OpenAiGatewayRequestContext;
    provider: InternalAiProvider;
    aiOption: ResolvedAiOptionExecutionConfig;
    providerSource: ProviderSource;
    stream: boolean;
    creditsToCharge: number;
    retryTrace: ApiRequestLog["retryTrace"];
    executionMetadata: UpstreamExecutionMetadata;
    responsePayload: unknown;
  }): Promise<void> {
    await dependencies.consumeCredits({
      userId: input.context.userId,
      amount: input.creditsToCharge,
      requestId: input.requestId,
      metadata: {
        providerId: input.provider.id,
        aiOptionId: input.aiOption.aiOptionId,
        requestKind: "chat.completions",
        providerSource: input.providerSource,
        usageSource: input.executionMetadata.usageSource
      }
    });

    input.retryTrace.push({
      providerId: input.provider.id,
      status: "success"
    });

    const latencyMs = dependencies.now().getTime() - input.requestStartedAt.getTime();
    await safeWriteRequestLog({
      userId: input.context.userId,
      providerId: input.provider.id,
      aiOptionId: input.aiOption.aiOptionId,
      legacyRuntimePresetId: input.aiOption.legacyRuntimePresetId,
      modelId: input.aiOption.modelId,
      status: "success",
      stream: input.stream,
      creditsUsed: input.creditsToCharge,
      latencyMs,
      errorCode: null,
      retryTrace: input.retryTrace,
      requestPayload: redactRequestPayloadForLogging(input.context.request),
      responsePayload: input.responsePayload,
      metadata: {
        requestId: input.requestId,
        requestKind: "chat.completions",
        providerId: input.provider.id,
        aiOptionId: input.aiOption.aiOptionId,
        providerSource: input.providerSource,
        usageSource: input.executionMetadata.usageSource,
        model: input.context.request.model,
        messageCount: input.context.request.messages.length,
        maxTokens: input.context.request.max_tokens ?? 0
      },
      createdAt: dependencies.now().toISOString()
    });

    await safeWriteTraceEvent({
      traceId: input.context.traceId,
      userId: input.context.userId,
      deviceId: input.context.deviceId ?? null,
      entrypoint: "desktop_local_proxy",
      requestKind: "chat.completions",
      clientRequestModel: input.context.request.model,
      resolvedAiOptionId: input.aiOption.aiOptionId,
      resolvedModelId: input.aiOption.modelId,
      resolvedUpstreamModel: input.aiOption.upstreamModel,
      providerId: input.provider.id,
      isStream: input.stream,
      stage: "ai_to_server",
      direction: "inbound",
      component: "upstream_ai",
      status: input.stream ? "finished" : "success",
      payloadJson: input.stream
        ? {
            usageSource: input.executionMetadata.usageSource,
            responseRecorded: false,
            streamSummary: input.executionMetadata.streamSummary ?? null
          }
        : input.responsePayload,
      payloadPreviewText: input.stream
        ? summarizeStreamSummaryForTrace(input.executionMetadata)
        : summarizeJsonForTrace(input.responsePayload),
      metadataJson: {
        requestId: input.requestId,
        usageSource: input.executionMetadata.usageSource,
        streamSummary: input.executionMetadata.streamSummary ?? null
      },
      inputTokens: input.executionMetadata.usage.promptTokens,
      outputTokens: input.executionMetadata.usage.completionTokens,
      totalTokens: input.executionMetadata.usage.totalTokens
    });
  }

  return {
    handleChatCompletion
  };
}

export function createDefaultOpenAiGatewayService() {
  return createOpenAiGatewayService({
    getCreditBalance,
    consumeCredits: async (input) => {
      await consumeCreditsFifo({
        userId: input.userId,
        amount: input.amount,
        requestId: input.requestId,
        metadata: input.metadata
      });
    },
    writeRequestLog: createSupabaseRequestLogWriter(),
    resolveAiOption: createSupabaseAiOptionResolver(),
    getProviders: () => createSupabaseProviderRepository().listSelectableProviders(),
    executeProvider: executeUpstreamProvider,
    writeTraceEvent: createSupabaseAiTraceRepository().appendEvent,
    random: Math.random,
    now: () => new Date(),
    reportLogWriteFailure: ({ error, requestId, userId, providerId, status }) => {
      console.error("ZebraGate request log write failed.", {
        requestId,
        userId,
        providerId,
        status,
        error: error instanceof Error ? error.message : "Unknown log write error"
      });
    }
  });
}

export function createSupabaseRequestLogWriter() {
  return async (input: CreateApiRequestLogInput): Promise<void> => {
    const client = getSupabaseAdminClient();
    const { error } = await client.from("api_request_logs").insert({
      user_id: input.userId,
      provider_id: input.providerId,
      ai_option_id: input.aiOptionId ?? null,
      runtime_preset_id: input.legacyRuntimePresetId ?? null,
      model_id: input.modelId ?? null,
      status: input.status,
      is_stream: input.stream,
      credits_used: input.creditsUsed,
      latency_ms: input.latencyMs,
      error_code: input.errorCode,
      error_message: input.errorMessage ?? null,
      retry_trace: input.retryTrace,
      metadata: input.metadata,
      request_payload: input.requestPayload ?? null,
      response_payload: input.responsePayload ?? null,
      created_at: input.createdAt
    });

    if (error) {
      throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
    }
  };
}

function summarizeJsonForTrace(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value).slice(0, 1000);
  } catch {
    return String(value).slice(0, 1000);
  }
}

function summarizeStreamSummaryForTrace(metadata: UpstreamExecutionMetadata): string {
  const prefix = `stream finished (${metadata.usageSource})`;
  if (!metadata.streamSummary) {
    return prefix;
  }

  return summarizeSseStreamSummaryForTrace(metadata.streamSummary, prefix);
}

export function createSupabaseAiOptionResolver() {
  return async (aiOptionId: string): Promise<ResolvedAiOptionExecutionConfig | null> => {
    const client = getSupabaseAdminClient();
    const { data, error } = await client
      .from("ai_options")
      .select(`
        id,
        runtime_preset_id,
        provider_id,
        model_id,
        actual_request_parameters_json,
        credit_multiplier,
        is_public,
        is_enabled,
        status
      `)
      .eq("id", aiOptionId)
      .eq("is_public", true)
      .eq("is_enabled", true)
      .neq("status", "disabled")
      .maybeSingle();

    if (error) {
      throw new ZebraGateApiError("PROVIDER_UNAVAILABLE", error.message, 503);
    }

    if (!data) {
      return null;
    }

    const row = data as {
      id: string;
      runtime_preset_id: string | null;
      provider_id: string;
      model_id: string;
      actual_request_parameters_json?: unknown;
      credit_multiplier: number;
    };

    const { data: modelData, error: modelError } = await client
      .from("ai_models")
      .select("upstream_model")
      .eq("id", row.model_id)
      .maybeSingle();

    if (modelError) {
      throw new ZebraGateApiError("PROVIDER_UNAVAILABLE", modelError.message, 503);
    }

    if (!modelData) {
      return null;
    }

    return {
      aiOptionId: row.id,
      legacyRuntimePresetId: row.runtime_preset_id,
      modelId: row.model_id,
      upstreamModel: (modelData as { upstream_model: string }).upstream_model,
      providerId: row.provider_id,
      creditMultiplier: row.credit_multiplier,
      requestParameters: toObjectRecord(row.actual_request_parameters_json)
    };
  };
}

function getRetryStatus(error: unknown): ApiRequestLog["retryTrace"][number]["status"] {
  if (error instanceof ZebraGateApiError && error.message.toLowerCase().includes("timed out")) {
    return "timeout";
  }

  return "failed";
}

function getProviderSourceFromRequest(request: OpenAICompatibleChatRequest): ProviderSource {
  return Object.prototype.hasOwnProperty.call(request, "ai_option_ids") ? "request" : "default_fallback";
}

function shuffleCandidates(
  candidates: AiOptionExecutionCandidate[],
  random: () => number
): AiOptionExecutionCandidate[] {
  return [...candidates]
    .map((candidate) => ({ candidate, sortKey: random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.candidate);
}

const REDACTED_USER_MESSAGE_CONTENT = "[redacted: user input]";

function redactRequestPayloadForLogging(request: unknown): unknown {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return request;
  }

  const requestRecord = request as Record<string, unknown>;
  const messages = Array.isArray(requestRecord.messages) ? requestRecord.messages : [];

  return {
    ...requestRecord,
    messages: messages.map((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        return message;
      }

      const messageRecord = message as Record<string, unknown>;
      return messageRecord.role === "user"
        ? { ...messageRecord, content: REDACTED_USER_MESSAGE_CONTENT }
        : messageRecord;
    })
  };
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
