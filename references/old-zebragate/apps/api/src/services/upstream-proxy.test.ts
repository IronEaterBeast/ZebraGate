import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { InternalAiProvider, ResolvedAiOptionExecutionConfig } from "./providers.js";
import { executeUpstreamProvider, tokensToCredits } from "./upstream-proxy.js";

async function createMockUpstreamServer(
  handler: RequestListener<typeof IncomingMessage, typeof ServerResponse>
): Promise<{
  baseUrl: string;
  close(): Promise<void>;
}> {
  const server = createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

const serversToClose: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (serversToClose.length > 0) {
    const close = serversToClose.pop();
    await close?.();
  }
});

function createProvider(baseUrl: string): InternalAiProvider {
  return {
    id: "00000000-0000-0000-0000-000000000101",
    displayName: "OpenAI Primary",
    baseUrl,
    apiKey: "provider-secret",
    model: "gpt-4o-mini",
    status: "healthy",
    creditMultiplier: 1.5,
    isEnabled: true
  };
}

function createAiOption(
  overrides: Partial<ResolvedAiOptionExecutionConfig> = {}
): ResolvedAiOptionExecutionConfig {
  return {
    aiOptionId: "00000000-0000-0000-0000-000000000201",
    legacyRuntimePresetId: null,
    modelId: "00000000-0000-0000-0000-000000000301",
    upstreamModel: "gpt-4o-mini",
    providerId: "00000000-0000-0000-0000-000000000101",
    creditMultiplier: 1.5,
    requestParameters: {},
    ...overrides
  };
}

describe("upstream proxy", () => {
  it("forwards non-stream requests to the real upstream and charges by reported usage", async () => {
    const server = await createMockUpstreamServer(async (request: IncomingMessage, response: ServerResponse) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/v1/chat/completions");
      expect(request.headers.authorization).toBe("Bearer provider-secret");

      let body = "";
      for await (const chunk of request) {
        body += chunk.toString();
      }

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed.model).toBe("gpt-4o-mini");
      expect(parsed).not.toHaveProperty("ai_option_ids");
      expect(parsed).not.toHaveProperty("zebragate_mock_behaviors");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1,
          model: "gpt-4o-mini",
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
            prompt_tokens: 300,
            completion_tokens: 500,
            total_tokens: 800
          }
        })
      );
    });
    serversToClose.push(server.close);

    const execution = await executeUpstreamProvider(
      createProvider(server.baseUrl),
      {
        model: "zebragate_model",
        messages: [{ role: "user", content: "hello" }],
        ai_option_ids: ["00000000-0000-0000-0000-000000000201"],
        zebragate_mock_behaviors: {
          "00000000-0000-0000-0000-000000000101": "success"
        }
      },
      createAiOption()
    );

    expect(execution.stream).toBe(false);
    if (!execution.stream) {
      expect((execution.completion as { object?: string }).object).toBe("chat.completion");
      expect(execution.creditsToCharge).toBe(tokensToCredits({
        promptTokens: 300,
        completionTokens: 500,
        totalTokens: 800
      }, 1.5));
      expect(execution.metadata.usageSource).toBe("reported");
    }
  });

  it("injects include_usage for stream requests and extracts usage from the final SSE chunk", async () => {
    const server = await createMockUpstreamServer(async (request: IncomingMessage, response: ServerResponse) => {
      let body = "";
      for await (const chunk of request) {
        body += chunk.toString();
      }

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed.stream).toBe(true);
      expect(parsed.stream_options).toEqual({ include_usage: true });

      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        connection: "keep-alive",
        "cache-control": "no-cache"
      });
      response.write(
        "data: {\"id\":\"chunk-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-4o-mini\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"},\"finish_reason\":null}]}\n\n"
      );
      response.write(
        "data: {\"id\":\"chunk-2\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-4o-mini\",\"choices\":[],\"usage\":{\"prompt_tokens\":120,\"completion_tokens\":280,\"total_tokens\":400}}\n\n"
      );
      response.end("data: [DONE]\n\n");
    });
    serversToClose.push(server.close);

    const execution = await executeUpstreamProvider(
      createProvider(server.baseUrl),
      {
        model: "zebragate_model",
        stream: true,
        messages: [{ role: "user", content: "hello" }]
      },
      createAiOption()
    );

    expect(execution.stream).toBe(true);
    if (execution.stream) {
      const reader = execution.streamBody.getReader();
      const decoder = new TextDecoder();
      let forwarded = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        forwarded += decoder.decode(value);
      }
      reader.releaseLock();

      const finalized = await execution.finalize();
      expect(forwarded).toContain("data:");
      expect(forwarded).toContain("[DONE]");
      expect(finalized.creditsToCharge).toBe(tokensToCredits({
        promptTokens: 120,
        completionTokens: 280,
        totalTokens: 400
      }, 1.5));
      expect(finalized.metadata.usageSource).toBe("reported");
      expect(finalized.metadata.streamSummary).toMatchObject({
        chunkCount: 3,
        outputTextPreview: "hello",
        completed: true
      });
    }
  });

  it("falls back to estimated usage when a stream completes without usage metadata", async () => {
    const server = await createMockUpstreamServer(async (_request: IncomingMessage, response: ServerResponse) => {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8"
      });
      response.write(
        "data: {\"id\":\"chunk-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-4o-mini\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"},\"finish_reason\":null}]}\n\n"
      );
      response.end("data: [DONE]\n\n");
    });
    serversToClose.push(server.close);

    const execution = await executeUpstreamProvider(
      createProvider(server.baseUrl),
      {
        model: "zebragate_model",
        stream: true,
        max_tokens: 900,
        messages: [{ role: "user", content: "hello" }]
      },
      createAiOption()
    );

    expect(execution.stream).toBe(true);
    if (execution.stream) {
      const reader = execution.streamBody.getReader();
      while (!(await reader.read()).done) {
        // Drain the forwarded stream before finalizing.
      }
      reader.releaseLock();

      const finalized = await execution.finalize();
      expect(finalized.creditsToCharge).toBe(tokensToCredits({
        promptTokens: 0,
        completionTokens: 900,
        totalTokens: 900
      }, 1.5));
      expect(finalized.metadata.usageSource).toBe("estimated");
    }
  });

  it("throws PROVIDER_UNAVAILABLE on upstream 5xx responses", async () => {
    const server = await createMockUpstreamServer(async (_request: IncomingMessage, response: ServerResponse) => {
      response.statusCode = 502;
      response.end("bad gateway");
    });
    serversToClose.push(server.close);

    await expect(
      executeUpstreamProvider(
        createProvider(server.baseUrl),
        {
          model: "zebragate_model",
          messages: [{ role: "user", content: "hello" }]
        },
        createAiOption()
      )
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE"
    });
  });
});
