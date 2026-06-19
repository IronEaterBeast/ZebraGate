import { describe, expect, it } from "vitest";
import {
  buildGeneratedAiOptionUpdatePayload,
  findDuplicateAiOptionByRequestParameters,
  type AdminAiOptionRecord
} from "./admin-ai-config.js";
import type { AiOptionGenerationPreviewItem } from "@zebragate/shared";

describe("admin ai config generation updates", () => {
  it("does not overwrite publicName for existing AI options during regeneration", () => {
    const payload = buildGeneratedAiOptionUpdatePayload(createPreviewItem(), "2026-06-10T00:00:00.000Z");

    expect(payload).not.toHaveProperty("public_name");
    expect(payload).toMatchObject({
      generated_config_summary: "思考",
      display_config_summary: "思考",
      generated_credit_multiplier: 1.5,
      credit_multiplier: 1.5
    });
  });
});

describe("findDuplicateAiOptionByRequestParameters", () => {
  it("finds an existing AI option with the same request parameters for the same model", () => {
    const aiOptions = [createAiOptionRecord({ id: "option-1", modelId: "model-1", actualRequestParametersJson: { thinking: true } })];

    const duplicate = findDuplicateAiOptionByRequestParameters(aiOptions, "model-1", { thinking: true });

    expect(duplicate?.id).toBe("option-1");
  });

  it("ignores key ordering when comparing request parameters", () => {
    const aiOptions = [
      createAiOptionRecord({
        id: "option-1",
        modelId: "model-1",
        actualRequestParametersJson: { thinking: true, reasoning_effort: "max" }
      })
    ];

    const duplicate = findDuplicateAiOptionByRequestParameters(aiOptions, "model-1", {
      reasoning_effort: "max",
      thinking: true
    });

    expect(duplicate?.id).toBe("option-1");
  });

  it("allows the same request parameters across different models", () => {
    const aiOptions = [createAiOptionRecord({ id: "option-1", modelId: "model-1", actualRequestParametersJson: { thinking: true } })];

    const duplicate = findDuplicateAiOptionByRequestParameters(aiOptions, "model-2", { thinking: true });

    expect(duplicate).toBeUndefined();
  });

  it("excludes the option being updated from the duplicate check", () => {
    const aiOptions = [createAiOptionRecord({ id: "option-1", modelId: "model-1", actualRequestParametersJson: { thinking: true } })];

    const duplicate = findDuplicateAiOptionByRequestParameters(aiOptions, "model-1", { thinking: true }, "option-1");

    expect(duplicate).toBeUndefined();
  });
});

function createAiOptionRecord(overrides: Partial<AdminAiOptionRecord>): AdminAiOptionRecord {
  return {
    id: "option-1",
    legacyRuntimePresetId: null,
    providerId: "provider-1",
    modelId: "model-1",
    publicName: "Zebra Reasoner",
    generatedConfigSummary: "",
    displayConfigSummary: "",
    displayConfigSummaryOverridden: false,
    generatedCreditMultiplier: 1,
    creditMultiplier: 1,
    creditMultiplierOverridden: false,
    actualRequestParametersJson: {},
    displayBadges: [],
    isRecommended: false,
    isPublic: true,
    isEnabled: true,
    status: "unknown",
    healthStatus: "unknown",
    disableReason: null,
    sortOrder: 0,
    adminNote: null,
    generatedBy: "manual",
    ...overrides
  };
}

function createPreviewItem(): AiOptionGenerationPreviewItem {
  return {
    action: "update",
    modelId: "model-1",
    providerId: "provider-1",
    publicName: "New Generated Name",
    parameterValues: {
      thinking: "enabled"
    },
    normalizedParameterValues: {
      thinking: "enabled"
    },
    requestParameters: {},
    hasRequestParameterConflict: false,
    conflictDetails: [],
    generatedConfigSummary: "思考",
    displayConfigSummary: "思考",
    displayConfigSummaryOverridden: false,
    generatedCreditMultiplier: 1.5,
    creditMultiplier: 1.5,
    creditMultiplierOverridden: false,
    existingRuntimePresetId: "preset-1",
    existingAiOptionId: "option-1"
  };
}
