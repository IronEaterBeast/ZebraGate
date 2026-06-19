import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { PublicAiOption } from "@zebragate/shared";
import { aiOptionRoutes } from "./ai-options.js";
import { fromAiOptionPublicCatalogRow, type PublicAiOptionRepository } from "../../services/ai-options.js";

describe("public AI option routes", () => {
  it("returns only recommended public enabled AI options by default", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/ai-options"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().aiOptions).toEqual([
      expect.objectContaining({
        aiOptionId: "option-recommended",
        isRecommended: true
      })
    ]);
  });

  it("returns all public enabled AI options when recommendedOnly is false", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/ai-options?recommendedOnly=false"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().aiOptions.map((option: { aiOptionId: string }) => option.aiOptionId)).toEqual([
      "option-recommended",
      "option-not-recommended"
    ]);
  });

  it("does not expose provider secrets or runtime request parameters", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/ai-options?recommendedOnly=false"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("api_key");
    expect(response.body).not.toContain("apiKey");
    expect(response.body).not.toContain("base_url");
    expect(response.body).not.toContain("baseUrl");
    expect(response.body).not.toContain("request_parameters");
    expect(response.body).not.toContain("requestParameters");
    expect(response.body).not.toContain("sk-secret");
    expect(response.body).not.toContain("https://secret-upstream.example/v1");
  });

  it("normalizes unsupported public AI option statuses to unknown", () => {
    const option = fromAiOptionPublicCatalogRow({
      ai_option_id: "option-1",
      provider_label: "Provider A",
      model_label: "Model A",
      public_name: "Model A",
      display_config_summary: "",
      display_badges: [],
      credit_multiplier: 1,
      is_recommended: true,
      status: "surprising",
      disable_reason: null,
      sort_order: 0,
      is_public: true,
      is_enabled: true
    });

    expect(option.status).toBe("unknown");
  });
});

async function buildTestApp() {
  const app = Fastify();
  await app.register(aiOptionRoutes, {
    prefix: "/v1/ai-options",
    repository: createMemoryRepository()
  });
  return app;
}

function createMemoryRepository(): PublicAiOptionRepository {
  return {
    async listPublicAiOptions(input) {
      const options: PublicAiOption[] = [
        {
          aiOptionId: "option-recommended",
          providerLabel: "Provider A",
          modelLabel: "Model A",
          publicName: "Model A 思考",
          displayConfigSummary: "思考",
          displayBadges: ["recommended"],
          creditMultiplier: 1.5,
          isRecommended: true,
          status: "healthy",
          disableReason: null,
          sortOrder: 0
        },
        {
          aiOptionId: "option-not-recommended",
          providerLabel: "Provider A",
          modelLabel: "Model A",
          publicName: "Model A 全部组合",
          displayConfigSummary: "思考 + 强度最大",
          displayBadges: [],
          creditMultiplier: 2.3,
          isRecommended: false,
          status: "healthy",
          disableReason: null,
          sortOrder: 1
        }
      ];

      return input.recommendedOnly ? options.filter((option) => option.isRecommended) : options;
    }
  };
}
