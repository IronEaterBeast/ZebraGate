import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminAiConfigRoutes } from "./admin-ai-config.js";
import type {
  AdminAiConfigCatalog,
  AdminAiConfigRepository,
  AdminAiOptionRecord,
  AdminModelRecord,
  AdminProviderRecord,
  CreateAdminAiOptionInput,
  CreateAdminModelInput,
  CreateAdminProviderInput,
  CreateAdminRuntimeTemplateInput,
  UpdateAdminAiOptionInput,
  UpdateAdminModelInput,
  UpdateAdminProviderInput,
  UpdateAdminRuntimeTemplateInput
} from "../../services/admin-ai-config.js";

const originalAdminUsername = process.env.ZEBRAGATE_ADMIN_USERNAME;
const originalAdminPassword = process.env.ZEBRAGATE_ADMIN_PASSWORD;

describe("admin AI config routes", () => {
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
      url: "/v1/admin/ai-config"
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns the admin catalog without provider secrets", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/ai-config",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      catalog: {
        providers: [
          {
            id: "provider-1",
            apiKeyConfigured: true,
            apiKeyPreview: "sk-z...7890",
            baseUrlConfigured: true
          }
        ]
      }
    });
    expect(response.body).not.toContain("sk-zebragate-secret-1234567890");
    expect(response.body).not.toContain("https://secret-upstream.example/v1");
  });

  it("previews generated AI option variants through the admin endpoint", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/generate-preview",
      headers: adminHeaders(),
      payload: {
        runtimeTemplateId: "template-1"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.preview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "create",
          publicName: "Zebra Reasoner 思考 + 强度最大",
          generatedConfigSummary: "思考 + 强度最大",
          displayConfigSummary: "思考 + 强度最大",
          generatedCreditMultiplier: 2.3,
          requestParameters: {
            thinking: {
              type: "enabled"
            },
            reasoning_effort: "max"
          }
        })
      ])
    );
  });

  it("applies generated AI option variants through the admin endpoint", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/generate-apply",
      headers: adminHeaders(),
      payload: {
        runtimeTemplateId: "template-1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().result).toMatchObject({
      created: 3,
      updated: 0,
      skipped: 0,
      conflicts: 0
    });
    expect(repository.appliedPreview).toHaveLength(3);
  });

  it("applies a single generated AI option suggestion when a target is specified", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const previewResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/generate-preview",
      headers: adminHeaders(),
      payload: {
        runtimeTemplateId: "template-1"
      }
    });

    const targetItem = previewResponse.json().preview.find(
      (item: { action: string }) => item.action === "create"
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/generate-apply",
      headers: adminHeaders(),
      payload: {
        runtimeTemplateId: "template-1",
        targetNormalizedParameterValues: targetItem.normalizedParameterValues
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().result).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      conflicts: 0
    });
    expect(repository.appliedPreview).toHaveLength(1);
  });

  it("returns empty preview when the runtime template has no parameter combinations", async () => {
    const repository = createMemoryRepository();
    repository.catalog.runtimeTemplates[0] = {
      ...repository.catalog.runtimeTemplates[0],
      parameterSchemaJson: {}
    };
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/generate-preview",
      headers: adminHeaders(),
      payload: {
        runtimeTemplateId: "template-1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().preview).toEqual([]);
  });

  it("allows supported AI option management updates for authenticated admins", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/ai-config/options/option-1",
      headers: adminHeaders(),
      payload: {
        isRecommended: false,
        displayConfigSummary: "管理员说明",
        displayConfigSummaryOverridden: true
      } satisfies UpdateAdminAiOptionInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().aiOption).toMatchObject({
      id: "option-1",
      isRecommended: false,
      displayConfigSummary: "管理员说明",
      displayConfigSummaryOverridden: true
    });
    expect(repository.updatedOptions[0]).toEqual({
      optionId: "option-1",
      input: {
        isRecommended: false,
        displayConfigSummary: "管理员说明",
        displayConfigSummaryOverridden: true
      }
    });
  });

  it("normalizes unsupported AI option update statuses before repository writes", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/ai-config/options/option-1",
      headers: adminHeaders(),
      payload: {
        status: "surprising",
        healthStatus: "strange"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(repository.updatedOptions[0]).toEqual({
      optionId: "option-1",
      input: {
        status: "unknown",
        healthStatus: "unknown"
      }
    });
  });

  it("creates a manual AI option for an existing runtime instance", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/options",
      headers: adminHeaders(),
      payload: {
        modelId: "model-1",
        publicName: "Manual Option",
        actualRequestParametersJson: {
          model: "gpt-5"
        },
        isRecommended: false
      } satisfies CreateAdminAiOptionInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().aiOption).toMatchObject({
      legacyRuntimePresetId: null,
      modelId: "model-1",
      publicName: "Manual Option",
      isRecommended: false,
      isPublic: false,
      isEnabled: false
    });
    expect(repository.createdOptions[0]).toMatchObject({
      modelId: "model-1",
      publicName: "Manual Option"
    });
  });

  it("allows multiple AI options under the same model with different actual params", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const firstResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/options",
      headers: adminHeaders(),
      payload: {
        modelId: "model-1",
        actualRequestParametersJson: { model: "gpt-5", thinking: true },
        publicName: "Manual Option A"
      } satisfies CreateAdminAiOptionInput
    });

    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/options",
      headers: adminHeaders(),
      payload: {
        modelId: "model-1",
        actualRequestParametersJson: { model: "gpt-5", thinking: false },
        publicName: "Manual Option B"
      } satisfies CreateAdminAiOptionInput
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(repository.catalog.aiOptions.filter((option) => option.modelId === "model-1")).toHaveLength(3);
  });

  it("normalizes unsupported AI option create statuses before repository writes", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/options",
      headers: adminHeaders(),
      payload: {
        modelId: "model-1",
        publicName: "Manual Option",
        actualRequestParametersJson: {
          model: "gpt-5"
        },
        status: "surprising",
        healthStatus: "strange"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(repository.createdOptions[0]).toMatchObject({
      status: "unknown",
      healthStatus: "unknown"
    });
  });

  it("creates a runtime template", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/runtime-templates",
      headers: adminHeaders(),
      payload: {
        templateKey: "thinking-template",
        name: "Thinking Template",
        parameterSchemaJson: {
          parameters: [
            {
              key: "thinking"
            }
          ]
        }
      } satisfies CreateAdminRuntimeTemplateInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().runtimeTemplate).toMatchObject({
      templateKey: "thinking-template",
      name: "Thinking Template"
    });
  });

  it("updates a runtime template", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/ai-config/runtime-templates/template-1",
      headers: adminHeaders(),
      payload: {
        name: "Renamed Template",
        isEnabled: false
      } satisfies UpdateAdminRuntimeTemplateInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().runtimeTemplate).toMatchObject({
      id: "template-1",
      name: "Renamed Template",
      isEnabled: false
    });
  });

  it("deletes an AI option for authenticated admins", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/admin/ai-config/options/option-1",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true
    });
    expect(repository.deletedOptionIds).toEqual(["option-1"]);
    expect(repository.catalog.aiOptions).toHaveLength(0);
  });

  it("creates a provider for authenticated admins", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/providers",
      headers: adminHeaders(),
      payload: {
        displayName: "New Provider",
        providerLabel: "New Provider Label",
        baseUrl: "https://new-upstream.example/v1",
        apiKey: "sk-new-secret"
      } satisfies CreateAdminProviderInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().provider).toMatchObject({
      displayName: "New Provider",
      providerLabel: "New Provider Label",
      baseUrlConfigured: true,
      apiKeyConfigured: true
    });
    expect(repository.createdProviders[0]).toMatchObject({
      displayName: "New Provider",
      providerLabel: "New Provider Label",
      baseUrl: "https://new-upstream.example/v1"
    });
  });

  it("updates a provider for authenticated admins", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/ai-config/providers/provider-1",
      headers: adminHeaders(),
      payload: {
        isEnabled: false,
        disableReason: "维护中"
      } satisfies UpdateAdminProviderInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().provider).toMatchObject({
      id: "provider-1",
      isEnabled: false,
      disableReason: "维护中"
    });
    expect(repository.updatedProviders[0]).toEqual({
      providerId: "provider-1",
      input: {
        isEnabled: false,
        disableReason: "维护中"
      }
    });
  });

  it("deletes a provider for authenticated admins", async () => {
    const repository = createMemoryRepository();
    repository.catalog.providers.push({
      id: "provider-2",
      displayName: "Removable Provider",
      providerLabel: "Removable",
      baseUrlConfigured: true,
      apiKeyConfigured: false,
      apiKeyPreview: null,
      status: "unknown",
      healthStatus: "unknown",
      isEnabled: true,
      disableReason: null,
      adminNote: null,
      migrationNote: null
    });
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/admin/ai-config/providers/provider-2",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true
    });
    expect(repository.deletedProviderIds).toEqual(["provider-2"]);
    expect(repository.catalog.providers).toHaveLength(1);
  });

  it("creates a model for authenticated admins", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/ai-config/models",
      headers: adminHeaders(),
      payload: {
        providerId: "provider-1",
        runtimeTemplateId: "template-1",
        modelKey: "zebra-flash",
        modelLabel: "Zebra Flash",
        upstreamModel: "zebra-flash",
        baseCreditMultiplier: 0.5
      } satisfies CreateAdminModelInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().model).toMatchObject({
      providerId: "provider-1",
      runtimeTemplateId: "template-1",
      modelKey: "zebra-flash",
      modelLabel: "Zebra Flash",
      upstreamModel: "zebra-flash",
      baseCreditMultiplier: 0.5
    });
    expect(repository.createdModels[0]).toMatchObject({
      providerId: "provider-1",
      modelKey: "zebra-flash"
    });
  });

  it("updates a model for authenticated admins", async () => {
    const repository = createMemoryRepository();
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/ai-config/models/model-1",
      headers: adminHeaders(),
      payload: {
        runtimeTemplateId: "template-1",
        isEnabled: false,
        baseCreditMultiplier: 2
      } satisfies UpdateAdminModelInput
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().model).toMatchObject({
      id: "model-1",
      runtimeTemplateId: "template-1",
      isEnabled: false,
      baseCreditMultiplier: 2
    });
    expect(repository.updatedModels[0]).toEqual({
      modelId: "model-1",
      input: {
        runtimeTemplateId: "template-1",
        isEnabled: false,
        baseCreditMultiplier: 2
      }
    });
  });

  it("deletes a model for authenticated admins", async () => {
    const repository = createMemoryRepository();
    repository.catalog.models.push({
      id: "model-2",
      providerId: "provider-1",
      runtimeTemplateId: "template-1",
      modelKey: "removable-model",
      modelLabel: "Removable Model",
      upstreamModel: "removable-model",
      baseCreditMultiplier: 1,
      status: "unknown",
      isEnabled: true,
      sortOrder: 1,
      adminNote: null
    });
    const app = await buildTestApp(repository);

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/admin/ai-config/models/model-2",
      headers: adminHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true
    });
    expect(repository.deletedModelIds).toEqual(["model-2"]);
    expect(repository.catalog.models).toHaveLength(1);
  });
});

async function buildTestApp(repository = createMemoryRepository()) {
  const app = Fastify();
  await app.register(sensible);
  await app.register(adminAiConfigRoutes, {
    prefix: "/v1/admin/ai-config",
    repository
  });
  return app;
}

function createMemoryRepository(): AdminAiConfigRepository & {
  catalog: AdminAiConfigCatalog;
  createdOptions: CreateAdminAiOptionInput[];
  deletedOptionIds: string[];
  updatedOptions: Array<{ optionId: string; input: UpdateAdminAiOptionInput }>;
  appliedPreview: unknown[];
  createdProviders: CreateAdminProviderInput[];
  deletedProviderIds: string[];
  updatedProviders: Array<{ providerId: string; input: UpdateAdminProviderInput }>;
  createdRuntimeTemplates: CreateAdminRuntimeTemplateInput[];
  deletedRuntimeTemplateIds: string[];
  updatedRuntimeTemplates: Array<{ runtimeTemplateId: string; input: UpdateAdminRuntimeTemplateInput }>;
  createdModels: CreateAdminModelInput[];
  deletedModelIds: string[];
  updatedModels: Array<{ modelId: string; input: UpdateAdminModelInput }>;
} {
  const catalog = createCatalog();
  const createdOptions: CreateAdminAiOptionInput[] = [];
  const deletedOptionIds: string[] = [];
  const updatedOptions: Array<{ optionId: string; input: UpdateAdminAiOptionInput }> = [];
  const appliedPreview: unknown[] = [];
  const createdProviders: CreateAdminProviderInput[] = [];
  const deletedProviderIds: string[] = [];
  const updatedProviders: Array<{ providerId: string; input: UpdateAdminProviderInput }> = [];
  const createdRuntimeTemplates: CreateAdminRuntimeTemplateInput[] = [];
  const deletedRuntimeTemplateIds: string[] = [];
  const updatedRuntimeTemplates: Array<{ runtimeTemplateId: string; input: UpdateAdminRuntimeTemplateInput }> = [];
  const createdModels: CreateAdminModelInput[] = [];
  const deletedModelIds: string[] = [];
  const updatedModels: Array<{ modelId: string; input: UpdateAdminModelInput }> = [];

  return {
    catalog,
    createdOptions,
    deletedOptionIds,
    updatedOptions,
    appliedPreview,
    createdProviders,
    deletedProviderIds,
    updatedProviders,
    createdRuntimeTemplates,
    deletedRuntimeTemplateIds,
    updatedRuntimeTemplates,
    createdModels,
    deletedModelIds,
    updatedModels,
    async listCatalog() {
      return catalog;
    },
    async getGenerationData(modelId: string) {
      const model = catalog.models.find((candidate) => candidate.id === modelId);
      if (!model) {
        throw new Error("model not found");
      }

      return {
        catalog,
        model
      };
    },
    async applyGenerationPreview(preview) {
      appliedPreview.push(...preview);
      return {
        created: preview.filter((item) => item.action === "create").length,
        updated: preview.filter((item) => item.action === "update").length,
        skipped: preview.filter((item) => item.action === "exists").length,
        conflicts: preview.filter((item) => item.action === "conflict").length,
        items: preview.map((item) => ({
          action: item.action === "exists" ? "skipped" : item.action,
          legacyRuntimePresetId: item.existingRuntimePresetId,
          aiOptionId: item.existingAiOptionId,
          publicName: item.publicName,
          conflictDetails: item.conflictDetails
        }))
      };
    },
    async createAiOption(input: CreateAdminAiOptionInput) {
      createdOptions.push(input);
      const model = catalog.models.find((candidate) => candidate.id === input.modelId);
      if (!model) {
        throw new Error("model not found");
      }

      const option: AdminAiOptionRecord = {
        id: `option-${catalog.aiOptions.length + 1}`,
        legacyRuntimePresetId: null,
        providerId: model.providerId,
        modelId: model.id,
        publicName: input.publicName,
        generatedConfigSummary: "",
        displayConfigSummary: input.displayConfigSummary ?? "",
        displayConfigSummaryOverridden: input.displayConfigSummaryOverridden ?? false,
        generatedCreditMultiplier: model.baseCreditMultiplier,
        creditMultiplier: input.creditMultiplier ?? model.baseCreditMultiplier,
        creditMultiplierOverridden: input.creditMultiplierOverridden ?? false,
        actualRequestParametersJson: input.actualRequestParametersJson ?? {},
        displayBadges: input.displayBadges ?? [],
        isRecommended: input.isRecommended ?? false,
        isPublic: input.isPublic ?? false,
        isEnabled: input.isEnabled ?? false,
        status: input.status ?? "unknown",
        healthStatus: input.healthStatus ?? "unknown",
        disableReason: input.disableReason ?? null,
        sortOrder: input.sortOrder ?? 0,
        adminNote: input.adminNote ?? null,
        generatedBy: "manual"
      };

      catalog.aiOptions.push(option);
      return option;
    },
    async createRuntimeTemplate(input: CreateAdminRuntimeTemplateInput) {
      createdRuntimeTemplates.push(input);
      const runtimeTemplate = {
        id: `template-${catalog.runtimeTemplates.length + 1}`,
        templateKey: input.templateKey,
        name: input.name,
        description: input.description ?? null,
        parameterSchemaJson: input.parameterSchemaJson ?? { parameters: {} },
        isEnabled: input.isEnabled ?? true,
        adminNote: input.adminNote ?? null,
        migrationNote: null
      };

      catalog.runtimeTemplates.push(runtimeTemplate);
      return runtimeTemplate;
    },
    async deleteAiOption(optionId: string) {
      deletedOptionIds.push(optionId);
      const optionIndex = catalog.aiOptions.findIndex((candidate) => candidate.id === optionId);
      if (optionIndex < 0) {
        throw new Error("option not found");
      }

      catalog.aiOptions.splice(optionIndex, 1);
    },
    async deleteRuntimeTemplate(runtimeTemplateId: string) {
      deletedRuntimeTemplateIds.push(runtimeTemplateId);
      const runtimeTemplateIndex = catalog.runtimeTemplates.findIndex((candidate) => candidate.id === runtimeTemplateId);
      if (runtimeTemplateIndex < 0) {
        throw new Error("runtime template not found");
      }

      catalog.runtimeTemplates.splice(runtimeTemplateIndex, 1);
    },
    async updateAiOption(optionId: string, input: UpdateAdminAiOptionInput) {
      updatedOptions.push({ optionId, input });
      const option = catalog.aiOptions.find((candidate) => candidate.id === optionId);
      if (!option) {
        throw new Error("option not found");
      }

      Object.assign(option, input);
      return option;
    },
    async updateRuntimeTemplate(runtimeTemplateId: string, input: UpdateAdminRuntimeTemplateInput) {
      updatedRuntimeTemplates.push({ runtimeTemplateId, input });
      const runtimeTemplate = catalog.runtimeTemplates.find((candidate) => candidate.id === runtimeTemplateId);
      if (!runtimeTemplate) {
        throw new Error("runtime template not found");
      }

      Object.assign(runtimeTemplate, input);
      return runtimeTemplate;
    },
    async createProvider(input: CreateAdminProviderInput) {
      createdProviders.push(input);
      const provider: AdminProviderRecord = {
        id: `provider-${catalog.providers.length + 1}`,
        displayName: input.displayName,
        providerLabel: input.providerLabel,
        baseUrlConfigured: input.baseUrl.trim().length > 0,
        apiKeyConfigured: Boolean(input.apiKey?.trim()),
        apiKeyPreview: input.apiKey?.trim() ? "configured" : null,
        status: input.status ?? "unknown",
        healthStatus: input.healthStatus ?? "unknown",
        isEnabled: input.isEnabled ?? true,
        disableReason: input.disableReason ?? null,
        adminNote: input.adminNote ?? null,
        migrationNote: null
      };

      catalog.providers.push(provider);
      return provider;
    },
    async updateProvider(providerId: string, input: UpdateAdminProviderInput) {
      updatedProviders.push({ providerId, input });
      const provider = catalog.providers.find((candidate) => candidate.id === providerId);
      if (!provider) {
        throw new Error("provider not found");
      }

      Object.assign(provider, input);
      return provider;
    },
    async deleteProvider(providerId: string) {
      deletedProviderIds.push(providerId);
      const providerIndex = catalog.providers.findIndex((candidate) => candidate.id === providerId);
      if (providerIndex < 0) {
        throw new Error("provider not found");
      }

      catalog.providers.splice(providerIndex, 1);
    },
    async createModel(input: CreateAdminModelInput) {
      createdModels.push(input);
      const model: AdminModelRecord = {
        id: `model-${catalog.models.length + 1}`,
        providerId: input.providerId,
        runtimeTemplateId: input.runtimeTemplateId ?? null,
        modelKey: input.modelKey,
        modelLabel: input.modelLabel,
        upstreamModel: input.upstreamModel,
        baseCreditMultiplier: input.baseCreditMultiplier ?? 1,
        status: input.status ?? "unknown",
        isEnabled: input.isEnabled ?? true,
        sortOrder: input.sortOrder ?? 0,
        adminNote: input.adminNote ?? null
      };

      catalog.models.push(model);
      return model;
    },
    async updateModel(modelId: string, input: UpdateAdminModelInput) {
      updatedModels.push({ modelId, input });
      const model = catalog.models.find((candidate) => candidate.id === modelId);
      if (!model) {
        throw new Error("model not found");
      }

      Object.assign(model, input);
      return model;
    },
    async deleteModel(modelId: string) {
      deletedModelIds.push(modelId);
      const modelIndex = catalog.models.findIndex((candidate) => candidate.id === modelId);
      if (modelIndex < 0) {
        throw new Error("model not found");
      }

      catalog.models.splice(modelIndex, 1);
    }
  };
}

function createCatalog(): AdminAiConfigCatalog {
  const aiOption: AdminAiOptionRecord = {
    id: "option-1",
    legacyRuntimePresetId: "preset-1",
    providerId: "provider-1",
    modelId: "model-1",
    publicName: "Zebra Reasoner",
    generatedConfigSummary: "",
    displayConfigSummary: "",
    displayConfigSummaryOverridden: false,
    generatedCreditMultiplier: 1.2,
    creditMultiplier: 1.2,
    creditMultiplierOverridden: false,
    actualRequestParametersJson: {},
    displayBadges: [],
    isRecommended: true,
    isPublic: true,
    isEnabled: true,
    status: "healthy",
    healthStatus: "healthy",
    disableReason: null,
    sortOrder: 0,
    adminNote: null,
    generatedBy: "manual"
  };

  return {
    providers: [
      {
        id: "provider-1",
        displayName: "Secret Provider",
        providerLabel: "Provider Label",
        baseUrlConfigured: true,
        apiKeyConfigured: true,
        apiKeyPreview: "sk-z...7890",
        status: "healthy",
        healthStatus: "healthy",
        isEnabled: true,
        disableReason: null,
        adminNote: null,
        migrationNote: null
      }
    ],
    runtimeTemplates: [
      {
        id: "template-1",
        templateKey: "default-template",
        name: "Default Template",
        description: null,
        parameterSchemaJson: {
          parameters: {
            thinking: {
              label: "Thinking",
              options: [
                {
                  internalKey: "disabled",
                  summary: "",
                  creditMultiplierDelta: 0,
                  requestParameterFragment: {}
                },
                {
                  internalKey: "enabled",
                  summary: "思考",
                  creditMultiplierDelta: 0.3,
                  requestParameterFragment: {
                    thinking: {
                      type: "enabled"
                    }
                  }
                }
              ]
            },
            reasoning_effort: {
              label: "Reasoning",
              options: [
                {
                  internalKey: "none",
                  summary: "",
                  creditMultiplierDelta: 0,
                  requestParameterFragment: {}
                },
                {
                  internalKey: "max",
                  summary: "强度最大",
                  creditMultiplierDelta: 0.8,
                  dependsOn: {
                    thinking: "enabled"
                  },
                  requestParameterFragment: {
                    reasoning_effort: "max"
                  }
                }
              ]
            }
          },
          requestDefaults: {},
          creditBaseMultiplier: null,
          creditCombinationRules: []
        },
        isEnabled: true,
        adminNote: null,
        migrationNote: null
      }
    ],
    models: [
      {
        id: "model-1",
        providerId: "provider-1",
        runtimeTemplateId: "template-1",
        modelKey: "zebra-reasoner",
        modelLabel: "Zebra Reasoner",
        upstreamModel: "zebra-reasoner",
        baseCreditMultiplier: 1.2,
        status: "healthy",
        isEnabled: true,
        sortOrder: 0,
        adminNote: null
      }
    ],
    dimensions: [
      {
        id: "dimension-thinking",
        modelId: "model-1",
        dimensionKey: "thinking",
        label: "Thinking",
        sortOrder: 0,
        isEnabled: true,
        adminNote: null
      },
      {
        id: "dimension-reasoning",
        modelId: "model-1",
        dimensionKey: "reasoning_effort",
        label: "Reasoning",
        sortOrder: 1,
        isEnabled: true,
        adminNote: null
      }
    ],
    dimensionValues: [
      {
        id: "value-thinking-disabled",
        dimensionId: "dimension-thinking",
        valueKey: "disabled",
        label: "默认",
        isDefault: true,
        omitWhenDefault: true,
        includeInSummary: true,
        creditMultiplierDelta: 0,
        requestParameterFragment: {},
        dependsOn: {},
        sortOrder: 0,
        isEnabled: true,
        adminNote: null
      },
      {
        id: "value-thinking-enabled",
        dimensionId: "dimension-thinking",
        valueKey: "enabled",
        label: "思考",
        isDefault: false,
        omitWhenDefault: false,
        includeInSummary: true,
        creditMultiplierDelta: 0.3,
        requestParameterFragment: {
          thinking: {
            type: "enabled"
          }
        },
        dependsOn: {},
        sortOrder: 1,
        isEnabled: true,
        adminNote: null
      },
      {
        id: "value-reasoning-none",
        dimensionId: "dimension-reasoning",
        valueKey: "none",
        label: "默认强度",
        isDefault: true,
        omitWhenDefault: true,
        includeInSummary: true,
        creditMultiplierDelta: 0,
        requestParameterFragment: {},
        dependsOn: {},
        sortOrder: 0,
        isEnabled: true,
        adminNote: null
      },
      {
        id: "value-reasoning-max",
        dimensionId: "dimension-reasoning",
        valueKey: "max",
        label: "强度最大",
        isDefault: false,
        omitWhenDefault: false,
        includeInSummary: true,
        creditMultiplierDelta: 0.8,
        requestParameterFragment: {
          reasoning_effort: "max"
        },
        dependsOn: {
          thinking: "enabled"
        },
        sortOrder: 1,
        isEnabled: true,
        adminNote: null
      }
    ],
    aiOptions: [aiOption]
  };
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
