import type { OpenAICompatibleChatRequest } from "@zebragate/shared";
import type { InternalAiProvider, ResolvedAiOptionExecutionConfig } from "./providers.js";
import { createSseStreamSummaryAccumulator, splitSseEvents } from "./sse-stream-summary.js";
import { ZebraGateApiError } from "../utils/errors.js";

const DEFAULT_UPSTREAM_TIMEOUT_MS = 60_000;
const DEFAULT_ESTIMATED_TOTAL_TOKENS = 256;
const CREDITS_PER_1K_TOKENS_BASE = 2;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UpstreamExecutionMetadata {
  usage: TokenUsage;
  usageSource: "reported" | "estimated";
  streamSummary?: {
    chunkCount: number;
    outputTextPreview: string;
    finishReason: string | null;
    completed: boolean;
  };
}

export interface UpstreamJsonExecutionSuccess {
  status: "success";
  stream: false;
  completion: unknown;
  creditsToCharge: number;
  metadata: UpstreamExecutionMetadata;
}

export interface UpstreamStreamExecutionSuccess {
  status: "success";
  stream: true;
  streamBody: ReadableStream<Uint8Array>;
  finalize: () => Promise<{
    creditsToCharge: number;
    metadata: UpstreamExecutionMetadata;
  }>;
}

export type UpstreamExecutionSuccess =
  | UpstreamJsonExecutionSuccess
  | UpstreamStreamExecutionSuccess;

export async function executeUpstreamProvider(
  provider: InternalAiProvider,
  request: OpenAICompatibleChatRequest,
  aiOption: ResolvedAiOptionExecutionConfig
): Promise<UpstreamExecutionSuccess> {
  const response = await fetchUpstream(provider, request, aiOption);

  if (request.stream) {
    const upstreamBody = response.body;
    if (!upstreamBody) {
      throw new ZebraGateApiError(
        "PROVIDER_UNAVAILABLE",
        `Provider ${provider.id} returned an empty stream body.`,
        502
      );
    }

    const [clientStream, parserStream] = upstreamBody.tee();

    return {
      status: "success",
      stream: true,
      streamBody: clientStream,
      finalize: async () => {
        const usage = await collectStreamUsage(parserStream, request);
        return {
          creditsToCharge: tokensToCredits(usage.usage, aiOption.creditMultiplier),
          metadata: usage
        };
      }
    };
  }

  const completion = await parseJsonResponse(response, provider.id);
  const usage = toExecutionMetadata(extractUsageFromJson(completion), request);

  return {
    status: "success",
    stream: false,
    completion,
    creditsToCharge: tokensToCredits(usage.usage, aiOption.creditMultiplier),
    metadata: usage
  };
}

export function tokensToCredits(usage: TokenUsage, creditMultiplier: number): number {
  // TODO: Replace this placeholder base rate with a provider/model-aware real cost mapping before launch.
  return Math.max(
    1,
    Math.ceil((usage.totalTokens / 1000) * creditMultiplier * CREDITS_PER_1K_TOKENS_BASE)
  );
}

export function buildUpstreamRequestBody(
  request: OpenAICompatibleChatRequest,
  aiOption: ResolvedAiOptionExecutionConfig
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...request,
    model: aiOption.upstreamModel,
    ...aiOption.requestParameters
  };

  delete body.ai_option_id;
  delete body.ai_option_ids;
  delete body.zebragate_mock_behaviors;

  if (request.stream) {
    const currentStreamOptions =
      typeof body.stream_options === "object" && body.stream_options && !Array.isArray(body.stream_options)
        ? (body.stream_options as Record<string, unknown>)
        : {};

    body.stream_options = {
      ...currentStreamOptions,
      include_usage: true
    };
  }

  return body;
}

async function fetchUpstream(
  provider: InternalAiProvider,
  request: OpenAICompatibleChatRequest,
  aiOption: ResolvedAiOptionExecutionConfig
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(buildUpstreamUrl(provider.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(buildUpstreamRequestBody(request, aiOption)),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await safelyReadErrorText(response);
      throw new ZebraGateApiError(
        "PROVIDER_UNAVAILABLE",
        `Provider ${provider.id} returned ${response.status}${errorText ? `: ${errorText}` : ""}.`,
        response.status >= 500 ? 502 : 503
      );
    }

    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw new ZebraGateApiError(
        "PROVIDER_UNAVAILABLE",
        `Provider ${provider.id} timed out.`,
        504
      );
    }

    if (error instanceof ZebraGateApiError) {
      throw error;
    }

    throw new ZebraGateApiError(
      "PROVIDER_UNAVAILABLE",
      `Provider ${provider.id} connection failed: ${error instanceof Error ? error.message : "Unknown error"}.`,
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildUpstreamUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBaseUrl).toString();
}

async function parseJsonResponse(response: Response, providerId: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new ZebraGateApiError(
      "PROVIDER_UNAVAILABLE",
      `Provider ${providerId} returned invalid JSON: ${error instanceof Error ? error.message : "Unknown error"}.`,
      502
    );
  }
}

async function collectStreamUsage(
  stream: ReadableStream<Uint8Array>,
  request: OpenAICompatibleChatRequest
): Promise<UpstreamExecutionMetadata> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: TokenUsage | null = null;
  const summaryAccumulator = createSseStreamSummaryAccumulator();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = splitSseEvents(buffer);
      buffer = parts.remaining;

      for (const eventText of parts.events) {
        usage = extractUsageFromSseEvent(eventText) ?? usage;
      }

      summaryAccumulator.push(value);
    }

    buffer += decoder.decode();
    if (buffer) {
      usage = extractUsageFromSseEvent(buffer) ?? usage;
    }
  } finally {
    reader.releaseLock();
  }

  const streamSummary = summaryAccumulator.finish();
  const usageMetadata = usage
    ? { usage, usageSource: "reported" as const }
    : createEstimatedUsage(request);

  return {
    ...usageMetadata,
    streamSummary
  };
}

function extractUsageFromSseEvent(eventText: string): TokenUsage | null {
  const dataLines = eventText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join("\n");
  if (payload === "[DONE]") {
    return null;
  }

  try {
    return extractUsageFromJson(JSON.parse(payload));
  } catch {
    return null;
  }
}

function extractUsageFromJson(payload: unknown): TokenUsage | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const promptTokens = toNonNegativeInteger((usage as Record<string, unknown>).prompt_tokens);
  const completionTokens = toNonNegativeInteger((usage as Record<string, unknown>).completion_tokens);
  const totalTokens = toNonNegativeInteger((usage as Record<string, unknown>).total_tokens);

  if (promptTokens === null || completionTokens === null || totalTokens === null) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  };
}

function createEstimatedUsage(request: OpenAICompatibleChatRequest): UpstreamExecutionMetadata {
  const totalTokens = Math.max(request.max_tokens ?? DEFAULT_ESTIMATED_TOTAL_TOKENS, 1);

  return {
    usage: {
      promptTokens: 0,
      completionTokens: totalTokens,
      totalTokens
    },
    usageSource: "estimated"
  };
}

function toExecutionMetadata(
  usage: TokenUsage | null,
  request: OpenAICompatibleChatRequest
): UpstreamExecutionMetadata {
  return usage
    ? { usage, usageSource: "reported" }
    : createEstimatedUsage(request);
}

function toNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

async function safelyReadErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
