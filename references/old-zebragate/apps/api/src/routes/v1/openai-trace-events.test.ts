import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CreateAiTraceEventInput } from "../../services/ai-traces.js";
import { openAiTraceEventRoutes } from "./openai-trace-events.js";

describe("openai trace event routes", () => {
  beforeEach(() => {
    process.env.ZEBRAGATE_ALLOW_MOCK_AUTH = "true";
  });

  afterEach(() => {
    delete process.env.ZEBRAGATE_ALLOW_MOCK_AUTH;
  });

  it("records a desktop trace event for the authenticated user", async () => {
    const recorded: CreateAiTraceEventInput[] = [];
    const app = Fastify();
    await app.register(openAiTraceEventRoutes, {
      prefix: "/v1/openai",
      repository: {
        async appendEvent(input) {
          recorded.push(input);
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/openai/trace-events",
      headers: {
        "x-zebragate-user-id": "user-1",
        "x-device-id": "device-1"
      },
      payload: {
        traceId: "trace-1",
        stage: "desktop_inbound",
        direction: "inbound",
        component: "desktop",
        status: "started",
        entrypoint: "desktop_local_proxy",
        requestKind: "chat.completions",
        clientRequestModel: "zebragate_model",
        isStream: false,
        payloadJson: {
          model: "zebragate_model"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recorded: true });
    expect(recorded).toEqual([
      expect.objectContaining({
        traceId: "trace-1",
        userId: "user-1",
        deviceId: "device-1",
        stage: "desktop_inbound",
        direction: "inbound",
        component: "desktop",
        status: "started"
      })
    ]);
  });
});
