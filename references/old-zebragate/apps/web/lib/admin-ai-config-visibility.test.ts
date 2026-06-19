import { describe, expect, it } from "vitest";
import type { AdminAiConfigCatalog, AdminAiOptionRecord, AdminModelRecord, AdminProviderRecord } from "./admin-api-client";
import { countCustomerVisibleAiOptions, countCustomerVisibleRecommendedAiOptions } from "./admin-ai-config-visibility";

describe("countCustomerVisibleAiOptions", () => {
  it("counts options that are public, enabled, and not disabled", () => {
    const catalog = buildCatalog({
      providers: [buildProvider({ id: "provider-1" })],
      models: [buildModel({ id: "model-1", providerId: "provider-1" })],
      aiOptions: [
        buildOption({ id: "option-1", modelId: "model-1", providerId: "provider-1" }),
        buildOption({ id: "option-2", modelId: "model-1", providerId: "provider-1", isPublic: false })
      ]
    });

    expect(countCustomerVisibleAiOptions(catalog)).toBe(1);
  });

  it("hides options whose parent model is disabled", () => {
    const catalog = buildCatalog({
      providers: [buildProvider({ id: "provider-1" })],
      models: [buildModel({ id: "model-1", providerId: "provider-1", isEnabled: false })],
      aiOptions: [buildOption({ id: "option-1", modelId: "model-1", providerId: "provider-1" })]
    });

    expect(countCustomerVisibleAiOptions(catalog)).toBe(0);
  });

  it("hides options whose parent model status is disabled", () => {
    const catalog = buildCatalog({
      providers: [buildProvider({ id: "provider-1" })],
      models: [buildModel({ id: "model-1", providerId: "provider-1", status: "disabled" })],
      aiOptions: [buildOption({ id: "option-1", modelId: "model-1", providerId: "provider-1" })]
    });

    expect(countCustomerVisibleAiOptions(catalog)).toBe(0);
  });

  it("hides options whose parent provider is disabled", () => {
    const catalog = buildCatalog({
      providers: [buildProvider({ id: "provider-1", isEnabled: false })],
      models: [buildModel({ id: "model-1", providerId: "provider-1" })],
      aiOptions: [buildOption({ id: "option-1", modelId: "model-1", providerId: "provider-1" })]
    });

    expect(countCustomerVisibleAiOptions(catalog)).toBe(0);
  });

  it("hides options whose parent provider status is disabled", () => {
    const catalog = buildCatalog({
      providers: [buildProvider({ id: "provider-1", status: "disabled" })],
      models: [buildModel({ id: "model-1", providerId: "provider-1" })],
      aiOptions: [buildOption({ id: "option-1", modelId: "model-1", providerId: "provider-1" })]
    });

    expect(countCustomerVisibleAiOptions(catalog)).toBe(0);
  });

  it("returns 0 when there are no AI options", () => {
    const catalog = buildCatalog({});

    expect(countCustomerVisibleAiOptions(catalog)).toBe(0);
  });
});

describe("countCustomerVisibleRecommendedAiOptions", () => {
  it("counts only recommended options that are visible to customers", () => {
    const catalog = buildCatalog({
      providers: [buildProvider({ id: "provider-1" })],
      models: [buildModel({ id: "model-1", providerId: "provider-1" })],
      aiOptions: [
        buildOption({ id: "option-1", modelId: "model-1", providerId: "provider-1", isRecommended: true }),
        buildOption({ id: "option-2", modelId: "model-1", providerId: "provider-1", isRecommended: false }),
        buildOption({ id: "option-3", modelId: "model-1", providerId: "provider-1", isRecommended: true, isPublic: false })
      ]
    });

    expect(countCustomerVisibleRecommendedAiOptions(catalog)).toBe(1);
  });

  it("returns 0 when visible options exist but none are recommended", () => {
    const catalog = buildCatalog({
      providers: [buildProvider({ id: "provider-1" })],
      models: [buildModel({ id: "model-1", providerId: "provider-1" })],
      aiOptions: [buildOption({ id: "option-1", modelId: "model-1", providerId: "provider-1", isRecommended: false })]
    });

    expect(countCustomerVisibleAiOptions(catalog)).toBe(1);
    expect(countCustomerVisibleRecommendedAiOptions(catalog)).toBe(0);
  });
});

function buildCatalog(overrides: Partial<AdminAiConfigCatalog>): AdminAiConfigCatalog {
  return {
    providers: [],
    runtimeTemplates: [],
    models: [],
    dimensions: [],
    dimensionValues: [],
    aiOptions: [],
    ...overrides
  };
}

function buildProvider(overrides: Partial<AdminProviderRecord>): AdminProviderRecord {
  return {
    id: "provider-1",
    displayName: "Provider",
    providerLabel: "Provider",
    baseUrlConfigured: true,
    apiKeyConfigured: true,
    apiKeyPreview: "sk-***",
    status: "healthy",
    healthStatus: "healthy",
    isEnabled: true,
    disableReason: null,
    adminNote: null,
    migrationNote: null,
    ...overrides
  };
}

function buildModel(overrides: Partial<AdminModelRecord>): AdminModelRecord {
  return {
    id: "model-1",
    providerId: "provider-1",
    runtimeTemplateId: null,
    modelKey: "model-key",
    modelLabel: "Model",
    upstreamModel: "upstream-model",
    baseCreditMultiplier: 1,
    status: "healthy",
    isEnabled: true,
    sortOrder: 0,
    adminNote: null,
    ...overrides
  };
}

function buildOption(overrides: Partial<AdminAiOptionRecord>): AdminAiOptionRecord {
  return {
    id: "option-1",
    legacyRuntimePresetId: null,
    providerId: "provider-1",
    modelId: "model-1",
    publicName: "Option",
    generatedConfigSummary: "",
    displayConfigSummary: "",
    displayConfigSummaryOverridden: false,
    generatedCreditMultiplier: 1,
    creditMultiplier: 1,
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
    generatedBy: "manual",
    ...overrides
  };
}
