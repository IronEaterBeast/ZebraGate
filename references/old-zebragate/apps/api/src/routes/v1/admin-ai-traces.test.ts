import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminAiTracesRoutes } from "./admin-ai-traces.js";
import type {
  AdminAiTraceDetail,
  AdminAiTraceListItem,
  AdminAiTracesRepository,
  ListAdminAiTracesInput,
  ListAdminAiTracesResult
} from "../../services/admin-ai-traces.js";

const originalAdminUsername = process.env.ZEBRAGATE_ADMIN_USERNAME;
const originalAdminPassword = process.env.ZEBRAGATE_ADMIN_PASSWORD;

describe("admin ai traces routes", () => {
  beforeEach(() => {
    process.env.ZEBRAGATE_ADMIN_USERNAME = "admin";
    process.env.ZEBRAGATE_ADMIN_PASSWORD = "secret";
  });

  afterEach(() => {
    restoreEnv("ZEBRAGATE_ADMIN_USERNAME", originalAdminUsername);
    restoreEnv("ZEBRAGATE_ADMIN_PASSWORD", originalAdminPassword);
  });

  it("requires admin authentication", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/ai-traces"
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns paginated trace summaries", async () => {
    const app = await buildTestApp(createMemoryRepository());

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/ai-traces?page=2&pageSize=10&status=success&providerId=provider-1",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          traceId: "trace-1",
          status: "success",
          providerLabel: "Provider One"
        }
      ],
      page: 2,
      pageSize: 10,
      total: 1
    });
  });

  it("returns one full trace detail", async () => {
    const app = await buildTestApp(createMemoryRepository());

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/ai-traces/trace-1",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      trace: {
        traceId: "trace-1",
        events: [
          {
            seqNo: 1,
            stage: "desktop_inbound"
          },
          {
            seqNo: 2,
            stage: "server_to_ai"
          }
        ]
      }
    });
  });

  it("returns token usage fields in trace list", async () => {
    const app = await buildTestApp(createMemoryRepository());

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/ai-traces",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          traceId: "trace-1",
          inputTokens: 100,
          outputTokens: 300,
          totalTokens: 400
        }
      ]
    });
  });

  it("returns token usage fields in trace detail", async () => {
    const app = await buildTestApp(createMemoryRepository());

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/ai-traces/trace-1",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      trace: {
        traceId: "trace-1",
        inputTokens: 100,
        outputTokens: 300,
        totalTokens: 400
      }
    });
  });
});

const sampleItem: AdminAiTraceListItem = {
  traceId: "trace-1",
  userId: "user-1",
  deviceId: "device-1",
  providerId: "provider-1",
  providerLabel: "Provider One",
  resolvedAiOptionId: "option-1",
  resolvedModelId: "model-1",
  resolvedUpstreamModel: "gpt-4o-mini",
  clientRequestModel: "zebragate_model",
  requestKind: "chat.completions",
  status: "success",
  isStream: false,
  startedAt: "2026-06-14T00:00:00.000Z",
  endedAt: "2026-06-14T00:00:01.000Z",
  totalLatencyMs: 1000,
  inputTokens: 100,
  outputTokens: 300,
  totalTokens: 400,
  errorCode: null,
  errorMessage: null
};

const sampleDetail: AdminAiTraceDetail = {
  ...sampleItem,
  events: [
    {
      traceId: "trace-1",
      seqNo: 1,
      stage: "desktop_inbound",
      direction: "inbound",
      component: "desktop",
      status: "started",
      occurredAt: "2026-06-14T00:00:00.000Z",
      latencyMs: null,
      httpStatus: null,
      errorCode: null,
      errorMessage: null,
      payloadJson: { model: "zebragate_model" },
      payloadPreviewText: "{\"model\":\"zebragate_model\"}",
      headersJson: {},
      metadataJson: {}
    },
    {
      traceId: "trace-1",
      seqNo: 2,
      stage: "server_to_ai",
      direction: "outbound",
      component: "api",
      status: "success",
      occurredAt: "2026-06-14T00:00:00.500Z",
      latencyMs: 500,
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
      payloadJson: { model: "gpt-4o-mini" },
      payloadPreviewText: "{\"model\":\"gpt-4o-mini\"}",
      headersJson: {},
      metadataJson: {}
    }
  ]
};

function createMemoryRepository(): AdminAiTracesRepository & { calls: ListAdminAiTracesInput[] } {
  const calls: ListAdminAiTracesInput[] = [];

  return {
    calls,
    async list(input: ListAdminAiTracesInput): Promise<ListAdminAiTracesResult> {
      calls.push(input);
      return {
        items: [sampleItem],
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 20,
        total: 1
      };
    },
    async getByTraceId(traceId: string): Promise<AdminAiTraceDetail | null> {
      return traceId === "trace-1" ? sampleDetail : null;
    }
  };
}

async function buildTestApp(repository?: AdminAiTracesRepository) {
  const app = Fastify();
  await app.register(sensible);
  await app.register(adminAiTracesRoutes, {
    prefix: "/v1/admin/ai-traces",
    repository
  });
  return app;
}

function adminHeaders(): { authorization: string } {
  return {
    authorization: `Basic ${Buffer.from("admin:secret").toString("base64")}`
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
