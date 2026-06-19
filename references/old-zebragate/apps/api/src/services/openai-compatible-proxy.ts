import type {
  AiProviderPublicInfo,
  OpenAICompatibleChatRequest,
  OpenAICompatibleChatResponseChunk
} from "@zebragate/shared";
import { ZEBRAGATE_MODEL } from "@zebragate/shared";
import { ZebraGateApiError } from "../utils/errors.js";

export type MockProviderBehavior = "success" | "fail" | "timeout";

export interface MockChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop";
  }>;
}

export interface MockProviderExecutionSuccess {
  status: "success";
  completion: MockChatCompletionResponse;
  chunks: OpenAICompatibleChatResponseChunk[];
  creditsToCharge: number;
}

export function executeMockProvider(
  provider: AiProviderPublicInfo,
  request: OpenAICompatibleChatRequest
): MockProviderExecutionSuccess {
  const behavior = request.zebragate_mock_behaviors?.[provider.id] ?? "success";

  if (behavior === "fail") {
    throw new ZebraGateApiError("PROVIDER_UNAVAILABLE", `Mock provider ${provider.id} failed.`, 502);
  }

  if (behavior === "timeout") {
    throw new ZebraGateApiError("PROVIDER_UNAVAILABLE", `Mock provider ${provider.id} timed out.`, 504);
  }

  return {
    status: "success",
    completion: createMockCompletion(request, provider),
    chunks: createMockCompletionChunks(request, provider),
    creditsToCharge: calculateMockCredits(provider)
  };
}

export function createMockCompletion(
  request: OpenAICompatibleChatRequest,
  provider: AiProviderPublicInfo
): MockChatCompletionResponse {
  const lastMessage = request.messages[request.messages.length - 1];

  return {
    id: `chatcmpl-${provider.id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: request.model || provider.model || ZEBRAGATE_MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: `ZebraGate mock reply via ${provider.displayName}: ${lastMessage?.content ?? "Hello from the proxy."}`
        },
        finish_reason: "stop"
      }
    ]
  };
}

export function createMockCompletionChunks(
  request: OpenAICompatibleChatRequest,
  provider: AiProviderPublicInfo
): OpenAICompatibleChatResponseChunk[] {
  const content = `ZebraGate mock stream via ${provider.displayName} for model ${request.model || provider.model || ZEBRAGATE_MODEL}.`;
  const created = Math.floor(Date.now() / 1000);

  return [
    {
      id: `chatcmpl-${provider.id}-stream`,
      object: "chat.completion.chunk",
      created,
      model: request.model || provider.model || ZEBRAGATE_MODEL,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
    },
    {
      id: `chatcmpl-${provider.id}-stream`,
      object: "chat.completion.chunk",
      created,
      model: request.model || provider.model || ZEBRAGATE_MODEL,
      choices: [{ index: 0, delta: { content }, finish_reason: "stop" }]
    }
  ];
}

function calculateMockCredits(provider: AiProviderPublicInfo): number {
  return Math.max(1, Math.ceil(10 * provider.creditMultiplier));
}
