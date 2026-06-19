import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApiRequestLog, OpenAICompatibleChatRequest } from "@zebragate/shared";
import { createOpenAiRoutes } from "../routes/v1/openai.js";
import type { CreateAiTraceEventInput } from "./ai-traces.js";
import { createOpenAiGatewayService } from "./openai-gateway.js";
import type { InternalAiProvider, ResolvedAiOptionExecutionConfig } from "./providers.js";
import { tokensToCredits } from "./upstream-proxy.js";
import { ZebraGateApiError } from "../utils/errors.js";

const providers: InternalAiProvider[] = [
  {
    id: "00000000-0000-0000-0000-000000000101",
    displayName: "OpenAI Primary",
    baseUrl: "https://provider-1.example/v1",
    apiKey: "key-1",
    model: "gpt-4o-mini",
    status: "healthy",
    creditMultiplier: 1,
    isEnabled: true
  },
  {
    id: "00000000-0000-0000-0000-000000000102",
    displayName: "Anthropic Backup",
    baseUrl: "https://provider-2.example/v1",
    apiKey: "key-2",
    model: "claude-sonnet-4-20250514",
    status: "degraded",
    creditMultiplier: 1.2,
    isEnabled: true
  }
];

const aiOptions: Record<string, ResolvedAiOptionExecutionConfig> = {
  "00000000-0000-0000-0000-000000000201": {
    aiOptionId: "00000000-0000-0000-0000-000000000201",
    legacyRuntimePresetId: null,
    modelId: "00000000-0000-0000-0000-000000000301",
    upstreamModel: "gpt-4o-mini",
    providerId: providers[0]!.id,
    creditMultiplier: 1,
    requestParameters: {}
  },
  "00000000-0000-0000-0000-000000000202": {
    aiOptionId: "00000000-0000-0000-0000-000000000202",
    legacyRuntimePresetId: null,
    modelId: "00000000-0000-0000-0000-000000000302",
    upstreamModel: "claude-sonnet-4-20250514",
    providerId: providers[1]!.id,
    creditMultiplier: 1.2,
    requestParameters: {}
  },
  "00000000-0000-0000-0000-000000000203": {
    aiOptionId: "00000000-0000-0000-0000-000000000203",
    legacyRuntimePresetId: "legacy-preset-1",
    modelId: "00000000-0000-0000-0000-000000000301",
    upstreamModel: "gpt-4o-mini",
    providerId: providers[0]!.id,
    creditMultiplier: 2,
    requestParameters: { temperature: 0.42 }
  }
};

function createGatewayTestDependencies(balance = 100) {
  const requestLogs: Array<{
    userId: string;
    providerId: string | null;
    aiOptionId?: string | null;
    legacyRuntimePresetId?: string | null;
    modelId?: string | null;
    status: "success" | "error" | "blocked";
    stream: boolean;
    creditsUsed: number;
    latencyMs: number;
    errorCode: string | null;
    retryTrace: ApiRequestLog["retryTrace"];
    metadata: Record<string, string | number | boolean | null>;
    createdAt: string;
  }> = [];
  const consumedAmounts: number[] = [];
  const traceEvents: CreateAiTraceEventInput[] = [];
  const logWriteFailures: Array<{
    requestId: string;
    userId: string;
    providerId: string | null;
    status: "success" | "error" | "blocked";
    error: string;
  }> = [];
  let currentBalance = balance;
  const nowValue = new Date("2026-06-09T00:00:00.000Z");
  let shouldFailLogWrite = false;

  return {
    requestLogs,
    consumedAmounts,
    traceEvents,
    logWriteFailures,
    setLogWriteFailure(value: boolean) {
      shouldFailLogWrite = value;
    },
    service: createOpenAiGatewayService({
      getCreditBalance: async () => ({ balance: currentBalance }),
      consumeCredits: async (input) => {
        consumedAmounts.push(input.amount);
        currentBalance -= input.amount;
      },
      writeRequestLog: async (input) => {
        requestLogs.push(input);
        if (shouldFailLogWrite) {
          throw new Error("log write failed");
        }
      },
      resolveAiOption: async (aiOptionId) => aiOptions[aiOptionId] ?? null,
      getProviders: async () => providers,
      writeTraceEvent: async (input) => {
        traceEvents.push(input);
      },
      executeProvider: async (provider, request, aiOption) => {
        const behavior = request.zebragate_mock_behaviors?.[provider.id] ?? "success";

        if (behavior === "fail") {
          throw new ZebraGateApiError("PROVIDER_UNAVAILABLE", `Mock provider ${provider.id} failed.`, 502);
        }

        if (behavior === "timeout") {
          throw new ZebraGateApiError("PROVIDER_UNAVAILABLE", `Mock provider ${provider.id} timed out.`, 504);
        }

        const usage = {
          promptTokens: 200,
          completionTokens: 400,
          totalTokens: 600
        };

        if (request.stream) {
          return {
            status: "success" as const,
            stream: true as const,
            streamBody: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    "data: {\"id\":\"chunk-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-4o-mini\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"},\"finish_reason\":null}]}\n\n"
                  )
                );
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: {"id":"chunk-2","object":"chat.completion.chunk","created":1,"model":"gpt-4o-mini","choices":[],"usage":{"prompt_tokens":${usage.promptTokens},"completion_tokens":${usage.completionTokens},"total_tokens":${usage.totalTokens}}}\n\n`
                  )
                );
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                controller.close();
              }
            }),
            finalize: async () => ({
              creditsToCharge: tokensToCredits(usage, aiOption.creditMultiplier),
              metadata: {
                usage,
                usageSource: "reported" as const,
                streamSummary: {
                  chunkCount: 3,
                  outputTextPreview: "hello",
                  finishReason: null,
                  completed: true
                }
              }
            })
          };
        }

        return {
          status: "success" as const,
          stream: false as const,
          completion: {
            id: "chatcmpl-1",
            object: "chat.completion",
            created: 1,
            model: provider.model,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "hello"
                },
                finish_reason: "stop"
              }
            ],
            usage: {
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
              total_tokens: usage.totalTokens
            }
          },
          creditsToCharge: tokensToCredits(usage, aiOption.creditMultiplier),
          metadata: {
            usage,
            usageSource: "reported" as const
          }
        };
      },
      random: (() => {
        const values = [0.1, 0.9, 0.2, 0.8];
        let index = 0;
        return () => {
          const value = values[index] ?? 0.5;
          index += 1;
          return value;
        };
      })(),
      now: () => nowValue,
      reportLogWriteFailure: ({ error, requestId, userId, providerId, status }) => {
        logWriteFailures.push({
          requestId,
          userId,
          providerId,
          status,
          error: error instanceof Error ? error.message : "Unknown log write error"
        });
      }
    })
  };
}

function createBaseRequest(): OpenAICompatibleChatRequest {
  return {
    model: "zebragate_model",
    messages: [{ role: "user", content: "hello zebra" }],
    stream: false
  };
}

describe("openai gateway service", () => {
  it("rejects requests when credits are insufficient and does not deduct credits", async () => {
    const { service, consumedAmounts, requestLogs } = createGatewayTestDependencies(0);

    await expect(
      service.handleChatCompletion({
        userId: "user-1",
        request: {
          ...createBaseRequest(),
          ai_option_ids: ["00000000-0000-0000-0000-000000000201"]
        }
      })
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS"
    });

    expect(consumedAmounts).toHaveLength(0);
    expect(requestLogs[0]?.creditsUsed).toBe(0);
    expect(requestLogs[0]?.errorCode).toBe("INSUFFICIENT_CREDITS");
    expect(requestLogs[0]?.metadata.providerSource).toBe("request");
  });

  it("returns OpenAI-compatible JSON and deducts credits from reported usage", async () => {
    const { service, consumedAmounts, requestLogs, traceEvents } = createGatewayTestDependencies();

    const result = await service.handleChatCompletion({
      userId: "user-1",
      traceId: "trace-success-1",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000201"]
      }
    });

    expect(result.stream).toBe(false);
    expect((result.completion as { object?: string }).object).toBe("chat.completion");
    expect(consumedAmounts).toEqual([2]);
    expect(requestLogs[0]?.status).toBe("success");
    expect(requestLogs[0]?.creditsUsed).toBe(2);
    expect(requestLogs[0]?.metadata.usageSource).toBe("reported");
    expect(requestLogs[0]?.aiOptionId).toBe("00000000-0000-0000-0000-000000000201");
    expect(traceEvents.map((event) => event.stage)).toContain("server_to_ai");
    expect(traceEvents.map((event) => event.stage)).toContain("ai_to_server");
  });

  it("resolves the provider and request parameters from the selected ai option", async () => {
    const { service, requestLogs } = createGatewayTestDependencies();

    const result = await service.handleChatCompletion({
      userId: "user-1",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000203"]
      }
    });

    expect(result.providerId).toBe(providers[0]!.id);
    expect(requestLogs[0]?.aiOptionId).toBe("00000000-0000-0000-0000-000000000203");
    expect(requestLogs[0]?.legacyRuntimePresetId).toBe("legacy-preset-1");
    expect(requestLogs[0]?.modelId).toBe("00000000-0000-0000-0000-000000000301");
  });

  it("uses the ai option credit multiplier rather than the provider's", async () => {
    const { service, consumedAmounts } = createGatewayTestDependencies();

    await service.handleChatCompletion({
      userId: "user-1",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000203"]
      }
    });

    expect(consumedAmounts).toEqual([
      tokensToCredits({ promptTokens: 200, completionTokens: 400, totalTokens: 600 }, 2)
    ]);
  });

  it("deducts credits only after a stream finishes", async () => {
    const { service, consumedAmounts, requestLogs, traceEvents } = createGatewayTestDependencies();

    const result = await service.handleChatCompletion({
      userId: "user-1",
      traceId: "trace-stream-1",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000201"],
        stream: true
      }
    });

    expect(result.stream).toBe(true);
    expect(consumedAmounts).toHaveLength(0);

    const reader = result.streamBody?.getReader();
    const chunks: string[] = [];
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(decoder.decode(value));
      }
      reader.releaseLock();
    }

    await result.finalizeStream?.();

    expect(chunks.join("")).toContain("data:");
    expect(consumedAmounts).toEqual([2]);
    expect(requestLogs[0]?.stream).toBe(true);
    expect(requestLogs[0]?.metadata.usageSource).toBe("reported");
    expect(traceEvents.find((event) => event.stage === "ai_to_server" && event.status === "finished")).toMatchObject({
      payloadJson: expect.objectContaining({
        streamSummary: expect.objectContaining({
          chunkCount: 3,
          outputTextPreview: "hello",
          completed: true
        })
      })
    });
  });

  it("retries with the next ai option after the first fails and deducts once", async () => {
    const { service, consumedAmounts, requestLogs, traceEvents } = createGatewayTestDependencies();

    const result = await service.handleChatCompletion({
      userId: "user-1",
      traceId: "trace-retry-1",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000201", "00000000-0000-0000-0000-000000000202"],
        zebragate_mock_behaviors: {
          [providers[0]!.id]: "fail",
          [providers[1]!.id]: "success"
        }
      }
    });

    expect(result.providerId).toBe(providers[1]!.id);
    expect(consumedAmounts).toHaveLength(1);
    expect(requestLogs[0]?.retryTrace).toEqual([
      {
        providerId: providers[0]!.id,
        status: "failed",
        error: `Mock provider ${providers[0]!.id} failed.`
      },
      {
        providerId: providers[1]!.id,
        status: "success"
      }
    ]);
    expect(traceEvents.filter((event) => event.stage === "server_to_ai")).toHaveLength(2);
  });

  it("does not deduct credits when all ai options fail and writes a failure log", async () => {
    const { service, consumedAmounts, requestLogs } = createGatewayTestDependencies();

    await expect(
      service.handleChatCompletion({
        userId: "user-1",
        request: {
          ...createBaseRequest(),
          ai_option_ids: ["00000000-0000-0000-0000-000000000201", "00000000-0000-0000-0000-000000000202"],
          zebragate_mock_behaviors: {
            [providers[0]!.id]: "fail",
            [providers[1]!.id]: "timeout"
          }
        }
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE"
    });

    expect(consumedAmounts).toHaveLength(0);
    expect(requestLogs[0]?.status).toBe("error");
    expect(requestLogs[0]?.creditsUsed).toBe(0);
    expect(requestLogs[0]?.providerId).toBe(providers[1]!.id);
    expect(requestLogs[0]?.retryTrace).toHaveLength(2);
  });

  it("does not write full prompt or response into request logs", async () => {
    const { service, requestLogs } = createGatewayTestDependencies();
    const request: OpenAICompatibleChatRequest = {
      ...createBaseRequest(),
      ai_option_ids: ["00000000-0000-0000-0000-000000000201"],
      messages: [{ role: "user", content: "secret prompt should not be logged" }]
    };

    await service.handleChatCompletion({
      userId: "user-1",
      request
    });

    expect(requestLogs[0]?.metadata).not.toHaveProperty("messages");
    expect(requestLogs[0]?.metadata).not.toHaveProperty("response");
    expect(JSON.stringify(requestLogs[0])).not.toContain("secret prompt should not be logged");
  });

  it("returns BAD_REQUEST when ai_option_ids are omitted", async () => {
    const { service, consumedAmounts, requestLogs } = createGatewayTestDependencies();

    await expect(
      service.handleChatCompletion({
        userId: "user-1",
        request: createBaseRequest()
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });

    expect(consumedAmounts).toHaveLength(0);
    expect(requestLogs).toHaveLength(0);
  });

  it("returns BAD_REQUEST when ai_option_ids is an empty array", async () => {
    const { service, consumedAmounts, requestLogs } = createGatewayTestDependencies();

    await expect(
      service.handleChatCompletion({
        userId: "user-1",
        request: {
          ...createBaseRequest(),
          ai_option_ids: []
        }
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });

    expect(consumedAmounts).toHaveLength(0);
    expect(requestLogs).toHaveLength(0);
  });

  it("returns PROVIDER_UNAVAILABLE when all requested ai_option_ids are unresolvable", async () => {
    const { service, consumedAmounts, requestLogs } = createGatewayTestDependencies();

    await expect(
      service.handleChatCompletion({
        userId: "user-1",
        request: {
          ...createBaseRequest(),
          ai_option_ids: ["00000000-0000-0000-0000-000000000999"]
        }
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE"
    });

    expect(consumedAmounts).toHaveLength(0);
    expect(requestLogs).toHaveLength(0);
  });

  it("still returns success when credit deduction succeeds but request log writing fails", async () => {
    const { service, consumedAmounts, logWriteFailures, requestLogs, setLogWriteFailure } =
      createGatewayTestDependencies();
    setLogWriteFailure(true);

    const result = await service.handleChatCompletion({
      userId: "user-1",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000201"]
      }
    });

    expect((result.completion as { object?: string }).object).toBe("chat.completion");
    expect(consumedAmounts).toEqual([2]);
    expect(requestLogs[0]?.metadata).not.toHaveProperty("messages");
    expect(requestLogs[0]?.metadata).not.toHaveProperty("response");
    expect(logWriteFailures).toHaveLength(1);
    expect(logWriteFailures[0]?.status).toBe("success");
  });

  it("still returns INSUFFICIENT_CREDITS when failure log writing fails, without deducting credits", async () => {
    const { service, consumedAmounts, logWriteFailures, setLogWriteFailure } =
      createGatewayTestDependencies(0);
    setLogWriteFailure(true);

    await expect(
      service.handleChatCompletion({
        userId: "user-1",
        request: {
          ...createBaseRequest(),
          ai_option_ids: ["00000000-0000-0000-0000-000000000201"]
        }
      })
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS"
    });

    expect(consumedAmounts).toHaveLength(0);
    expect(logWriteFailures).toHaveLength(1);
    expect(logWriteFailures[0]?.status).toBe("error");
  });

  it("still returns PROVIDER_UNAVAILABLE when failure log writing fails, without deducting credits", async () => {
    const { service, consumedAmounts, logWriteFailures, setLogWriteFailure } =
      createGatewayTestDependencies();
    setLogWriteFailure(true);

    await expect(
      service.handleChatCompletion({
        userId: "user-1",
        request: {
          ...createBaseRequest(),
          ai_option_ids: ["00000000-0000-0000-0000-000000000201", "00000000-0000-0000-0000-000000000202"],
          zebragate_mock_behaviors: {
            [providers[0]!.id]: "fail",
            [providers[1]!.id]: "timeout"
          }
        }
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE"
    });

    expect(consumedAmounts).toHaveLength(0);
    expect(logWriteFailures).toHaveLength(1);
    expect(logWriteFailures[0]?.status).toBe("error");
  });

  it("does not reference saved_selection in request logs", async () => {
    const { service, requestLogs } = createGatewayTestDependencies();

    await service.handleChatCompletion({
      userId: "user-1",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000201"]
      }
    });

    expect(JSON.stringify(requestLogs[0])).not.toContain("saved_selection");
  });

  it("writes token usage to the ai_to_server trace event for non-stream requests", async () => {
    const { service, traceEvents } = createGatewayTestDependencies();

    await service.handleChatCompletion({
      userId: "user-1",
      traceId: "trace-token-nonstream",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000201"]
      }
    });

    const aiToServerEvent = traceEvents.find(
      (event) => event.stage === "ai_to_server" && event.status === "success"
    );
    expect(aiToServerEvent).toMatchObject({
      inputTokens: 200,
      outputTokens: 400,
      totalTokens: 600
    });
  });

  it("writes token usage to the ai_to_server trace event for stream requests", async () => {
    const { service, traceEvents } = createGatewayTestDependencies();

    const result = await service.handleChatCompletion({
      userId: "user-1",
      traceId: "trace-token-stream",
      request: {
        ...createBaseRequest(),
        ai_option_ids: ["00000000-0000-0000-0000-000000000201"],
        stream: true
      }
    });

    const reader = result.streamBody?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
      reader.releaseLock();
    }
    await result.finalizeStream?.();

    const aiToServerEvent = traceEvents.find(
      (event) => event.stage === "ai_to_server" && event.status === "finished"
    );
    expect(aiToServerEvent).toMatchObject({
      inputTokens: 200,
      outputTokens: 400,
      totalTokens: 600
    });
  });
});

describe("openai route", () => {
  beforeEach(() => {
    process.env.ZEBRAGATE_ALLOW_MOCK_AUTH = "true";
  });

  afterEach(() => {
    delete process.env.ZEBRAGATE_ALLOW_MOCK_AUTH;
  });

  it("returns SSE formatted chunks for legacy in-memory stream responses", async () => {
    const app = Fastify();
    await app.register(
      createOpenAiRoutes({
        async handleChatCompletion() {
          return {
            requestId: "req-stream-1",
            providerId: providers[0]!.id,
            stream: true,
            creditsUsed: 10,
            retryTrace: [{ providerId: providers[0]!.id, status: "success" }],
            chunks: [
              {
                id: "chunk-1",
                object: "chat.completion.chunk",
                created: 1,
                model: "zebragate_model",
                choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
              }
            ]
          };
        }
      }, {
        async appendEvent() {}
      }),
      { prefix: "/v1/openai" }
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/openai/chat/completions",
      payload: {
        model: "zebragate_model",
        stream: true,
        messages: [{ role: "user", content: "hello" }]
      }
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("data:");
    expect(response.body).toContain("[DONE]");
  });

  it("pipes raw upstream SSE bytes when streamBody is provided", async () => {
    const app = Fastify();
    await app.register(
      createOpenAiRoutes({
        async handleChatCompletion() {
          return {
            requestId: "req-stream-2",
            providerId: providers[0]!.id,
            stream: true,
            creditsUsed: 0,
            retryTrace: [],
            streamBody: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("data: {\"hello\":\"world\"}\n\n"));
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                controller.close();
              }
            }),
            finalizeStream: async () => {}
          };
        }
      }, {
        async appendEvent() {}
      }),
      { prefix: "/v1/openai" }
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/openai/chat/completions",
      payload: {
        model: "zebragate_model",
        stream: true,
        messages: [{ role: "user", content: "hello" }]
      }
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("{\"hello\":\"world\"}");
    expect(response.body).toContain("[DONE]");
  });
});
