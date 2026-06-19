import { describe, expect, it } from "vitest";
import {
  generateAiOptionVariantPreview,
  normalizeParameterValues,
  type AiOptionGenerationDimension,
  type AiOptionGenerationModel
} from "@zebragate/shared";

const model: AiOptionGenerationModel = {
  id: "model-1",
  providerId: "provider-1",
  modelLabel: "Zebra Reasoner",
  baseCreditMultiplier: 1.2
};

function createThinkingDimensions(): AiOptionGenerationDimension[] {
  return [
    {
      key: "thinking",
      label: "Thinking",
      values: [
        {
          key: "disabled",
          summary: "",
          requestParameterFragment: {}
        },
        {
          key: "enabled",
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
    {
      key: "reasoning_effort",
      label: "Reasoning effort",
      values: [
        {
          key: "none",
          summary: "",
          requestParameterFragment: {}
        },
        {
          key: "high",
          summary: "",
          creditMultiplierDelta: 0.4,
          requestParameterFragment: {
            reasoning_effort: "high"
          },
          dependsOn: {
            thinking: "enabled"
          }
        },
        {
          key: "max",
          summary: "强度最大",
          creditMultiplierDelta: 0.8,
          requestParameterFragment: {
            reasoning_effort: "max"
          },
          dependsOn: {
            thinking: "enabled"
          }
        }
      ]
    }
  ];
}

describe("AI option variant generator", () => {
  it("generates legal combinations with dependencies", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: createThinkingDimensions()
    });

    expect(preview.map((item) => item.normalizedParameterValues)).toEqual([
      { reasoning_effort: "none", thinking: "disabled" },
      { reasoning_effort: "none", thinking: "enabled" },
      { reasoning_effort: "high", thinking: "enabled" },
      { reasoning_effort: "max", thinking: "enabled" }
    ]);
    expect(
      preview.some((item) =>
        item.normalizedParameterValues.thinking === "disabled" &&
        item.normalizedParameterValues.reasoning_effort !== "none"
      )
    ).toBe(false);
  });

  it("builds summaries by joining non-empty option summaries", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: createThinkingDimensions()
    });

    expect(findSummary(preview, "disabled", "none")).toBe("");
    expect(findSummary(preview, "enabled", "none")).toBe("思考");
    expect(findSummary(preview, "enabled", "high")).toBe("思考");
    expect(findSummary(preview, "enabled", "max")).toBe("思考 + 强度最大");
  });

  it("merges value request parameter fragments into runtime request_parameters", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: createThinkingDimensions()
    });

    const maxThinking = preview.find(
      (item) =>
        item.normalizedParameterValues.thinking === "enabled" &&
        item.normalizedParameterValues.reasoning_effort === "max"
    );

    expect(maxThinking?.requestParameters).toEqual({
      thinking: {
        type: "enabled"
      },
      reasoning_effort: "max"
    });
    expect(maxThinking?.hasRequestParameterConflict).toBe(false);
  });

  it("calculates credit multipliers from model base multiplier plus value deltas", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: createThinkingDimensions()
    });

    expect(findMultiplier(preview, "disabled", "none")).toBe(1.2);
    expect(findMultiplier(preview, "enabled", "none")).toBe(1.5);
    expect(findMultiplier(preview, "enabled", "high")).toBe(1.9);
    expect(findMultiplier(preview, "enabled", "max")).toBe(2.3);
  });

  it("keeps existing combinations idempotent by normalized model parameter values", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: createThinkingDimensions(),
      existingAiOptions: [
        {
          id: "option-existing",
          modelId: model.id,
          requestParameters: {
            thinking: {
              type: "enabled"
            },
            reasoning_effort: "max"
          },
          publicName: "Zebra Reasoner 思考 + 强度最大",
          generatedConfigSummary: "思考 + 强度最大",
          displayConfigSummary: "思考 + 强度最大",
          displayConfigSummaryOverridden: false,
          generatedCreditMultiplier: 2.3,
          creditMultiplier: 2.3,
          creditMultiplierOverridden: false
        }
      ]
    });

    const existing = preview.find((item) => item.existingAiOptionId === "option-existing");

    expect(existing?.action).toBe("exists");
    expect(existing?.existingAiOptionId).toBe("option-existing");
    expect(preview.filter((item) => item.action === "create")).toHaveLength(3);
  });

  it("treats a preset whose AI option was deleted as creatable again, reusing the preset", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: createThinkingDimensions(),
      existingAiOptions: []
    });

    const existing = preview.find((item) => item.normalizedParameterValues.thinking === "enabled" && item.normalizedParameterValues.reasoning_effort === "max");

    expect(existing?.action).toBe("create");
    expect(existing?.existingAiOptionId).toBeUndefined();
  });

  it("does not overwrite admin-overridden summaries or credit multipliers during regeneration", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: createThinkingDimensions(),
      existingAiOptions: [
        {
          id: "option-existing",
          modelId: model.id,
          requestParameters: {
            reasoning_effort: "max",
            thinking: {
              type: "enabled"
            }
          },
          publicName: "Test Model 旧说明",
          generatedConfigSummary: "旧说明",
          displayConfigSummary: "管理员说明",
          displayConfigSummaryOverridden: true,
          generatedCreditMultiplier: 9.9,
          creditMultiplier: 7.7,
          creditMultiplierOverridden: true
        }
      ]
    });

    const existing = preview.find((item) => item.existingAiOptionId === "option-existing");

    expect(existing?.action).toBe("update");
    expect(existing?.generatedConfigSummary).toBe("思考 + 强度最大");
    expect(existing?.displayConfigSummary).toBe("管理员说明");
    expect(existing?.generatedCreditMultiplier).toBe(2.3);
    expect(existing?.creditMultiplier).toBe(7.7);
  });

  it("treats a dimension whose values all depend on an unmet condition as not contributing to the combination", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: [
        {
          key: "thinking",
          label: "Thinking",
          values: [
            { key: "disabled", summary: "", requestParameterFragment: { thinking: { type: "disabled" } } },
            { key: "enabled", summary: "思考", requestParameterFragment: { thinking: { type: "enabled" } } }
          ]
        },
        {
          key: "reasoning_effort",
          label: "Reasoning effort",
          values: [
            {
              key: "high",
              summary: "",
              dependsOn: { thinking: "enabled" },
              requestParameterFragment: { reasoning_effort: "high" }
            },
            {
              key: "max",
              summary: "最大",
              dependsOn: { thinking: "enabled" },
              requestParameterFragment: { reasoning_effort: "max" }
            }
          ]
        }
      ]
    });

    expect(preview.map((item) => item.normalizedParameterValues)).toEqual([
      { thinking: "disabled" },
      { reasoning_effort: "high", thinking: "enabled" },
      { reasoning_effort: "max", thinking: "enabled" }
    ]);

    const disabledItem = preview.find((item) => item.normalizedParameterValues.thinking === "disabled");
    expect(disabledItem?.requestParameters).toEqual({ thinking: { type: "disabled" } });
    expect(disabledItem?.generatedConfigSummary).toBe("");
  });

  it("marks request parameter conflicts instead of silently producing ambiguous parameters", () => {
    const preview = generateAiOptionVariantPreview({
      model,
      dimensions: [
        {
          key: "mode",
          label: "Mode",
          values: [
            {
              key: "creative",
              requestParameterFragment: {
                temperature: 0.8
              }
            }
          ]
        },
        {
          key: "safety",
          label: "Safety",
          values: [
            {
              key: "strict",
              requestParameterFragment: {
                temperature: 0.2
              }
            }
          ]
        }
      ]
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]?.action).toBe("conflict");
    expect(preview[0]?.hasRequestParameterConflict).toBe(true);
    expect(preview[0]?.conflictDetails).toEqual(["temperature"]);
  });
});

function findSummary(
  preview: ReturnType<typeof generateAiOptionVariantPreview>,
  thinking: string,
  reasoningEffort: string
): string | undefined {
  return preview.find(
    (item) =>
      item.normalizedParameterValues.thinking === thinking &&
      item.normalizedParameterValues.reasoning_effort === reasoningEffort
  )?.generatedConfigSummary;
}

function findMultiplier(
  preview: ReturnType<typeof generateAiOptionVariantPreview>,
  thinking: string,
  reasoningEffort: string
): number | undefined {
  return preview.find(
    (item) =>
      item.normalizedParameterValues.thinking === thinking &&
      item.normalizedParameterValues.reasoning_effort === reasoningEffort
  )?.generatedCreditMultiplier;
}
