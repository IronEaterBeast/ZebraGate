import { describe, expect, it } from "vitest";
import { buildGenerationPreview } from "./runtime-template-generation-preview";

describe("buildGenerationPreview", () => {
  it("returns no items for invalid JSON or schema without parameters", () => {
    expect(buildGenerationPreview("{ invalid")).toEqual({ items: [], warnings: [] });
    expect(buildGenerationPreview(JSON.stringify({ parameters: {} }))).toEqual({ items: [], warnings: [] });
  });

  it("builds the cartesian product of parameter options with summaries and credit multipliers", () => {
    const schema = {
      parameters: {
        thinking: {
          label: "Thinking",
          options: [
            { internalKey: "disabled", summary: "", requestParameterFragment: {}, creditMultiplierDelta: 0 },
            {
              internalKey: "enabled",
              summary: "思考",
              requestParameterFragment: { thinking: { type: "enabled" } },
              creditMultiplierDelta: 0.3
            }
          ]
        },
        reasoning_effort: {
          label: "Reasoning Effort",
          options: [
            { internalKey: "none", summary: "", requestParameterFragment: {}, creditMultiplierDelta: 0 },
            {
              internalKey: "max",
              summary: "强度最大",
              dependsOn: { thinking: "enabled" },
              requestParameterFragment: { reasoning_effort: "max" },
              creditMultiplierDelta: 0.8
            }
          ]
        }
      },
      creditBaseMultiplier: 1
    };

    const result = buildGenerationPreview(JSON.stringify(schema));

    expect(result.warnings).toEqual([]);
    expect(result.items).toEqual([
      {
        normalizedParameterValues: { reasoning_effort: "none", thinking: "disabled" },
        requestParameters: {},
        hasRequestParameterConflict: false,
        conflictDetails: [],
        generatedConfigSummary: "",
        generatedCreditMultiplier: 1
      },
      {
        normalizedParameterValues: { reasoning_effort: "none", thinking: "enabled" },
        requestParameters: { thinking: { type: "enabled" } },
        hasRequestParameterConflict: false,
        conflictDetails: [],
        generatedConfigSummary: "思考",
        generatedCreditMultiplier: 1.3
      },
      {
        normalizedParameterValues: { reasoning_effort: "max", thinking: "enabled" },
        requestParameters: { thinking: { type: "enabled" }, reasoning_effort: "max" },
        hasRequestParameterConflict: false,
        conflictDetails: [],
        generatedConfigSummary: "思考 + 强度最大",
        generatedCreditMultiplier: 2.1
      }
    ]);
  });

  it("applies creditCombinationRules deltas when the rule's conditions match", () => {
    const schema = {
      parameters: {
        thinking: {
          label: "Thinking",
          options: [{ internalKey: "enabled", summary: "思考", creditMultiplierDelta: 0.3 }]
        },
        reasoning_effort: {
          label: "Reasoning Effort",
          options: [{ internalKey: "max", summary: "强度最大", creditMultiplierDelta: 0.8 }]
        }
      },
      creditBaseMultiplier: 1,
      creditCombinationRules: [{ when: { thinking: "enabled", reasoning_effort: "max" }, delta: 0.2 }]
    };

    const result = buildGenerationPreview(JSON.stringify(schema));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.generatedCreditMultiplier).toBe(2.3);
  });

  it("merges requestDefaults with option fragments and reports conflicts", () => {
    const schema = {
      parameters: {
        thinking: {
          label: "Thinking",
          options: [
            { internalKey: "enabled", summary: "思考", requestParameterFragment: { temperature: 0.9 } }
          ]
        }
      },
      requestDefaults: { temperature: 0.7, top_p: 1 }
    };

    const result = buildGenerationPreview(JSON.stringify(schema));

    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.requestParameters).toEqual({ temperature: 0.7, top_p: 1 });
    expect(item.hasRequestParameterConflict).toBe(true);
    expect(item.conflictDetails).toEqual(["temperature"]);
  });

  it("warns when a dimension has no valid options and skips it", () => {
    const schema = {
      parameters: {
        thinking: { label: "Thinking", options: [{ summary: "missing internalKey" }] },
        reasoning_effort: {
          label: "Reasoning Effort",
          options: [{ internalKey: "max", summary: "强度最大" }]
        }
      }
    };

    const result = buildGenerationPreview(JSON.stringify(schema));

    expect(result.warnings).toEqual([
      { type: "empty_dimension", message: "参数维度「thinking」没有任何有效候选值（internalKey 缺失或为空），将被忽略。" }
    ]);
    expect(result.items).toEqual([
      {
        normalizedParameterValues: { reasoning_effort: "max" },
        requestParameters: {},
        hasRequestParameterConflict: false,
        conflictDetails: [],
        generatedConfigSummary: "强度最大",
        generatedCreditMultiplier: 1
      }
    ]);
  });

  it("treats a dimension whose values all depend on an unmet condition as not contributing to the combination", () => {
    const schema = {
      parameters: {
        thinking: {
          label: "Thinking",
          options: [
            { internalKey: "disabled", summary: "" },
            { internalKey: "enabled", summary: "思考", requestParameterFragment: { thinking: { type: "enabled" } } }
          ]
        },
        reasoning_effort: {
          label: "Reasoning Effort",
          options: [
            { internalKey: "high", summary: "", dependsOn: { thinking: "enabled" }, requestParameterFragment: { reasoning_effort: "high" } },
            { internalKey: "max", summary: "最大", dependsOn: { thinking: "enabled" }, requestParameterFragment: { reasoning_effort: "max" } }
          ]
        }
      }
    };

    const result = buildGenerationPreview(JSON.stringify(schema));

    expect(result.warnings).toEqual([]);
    expect(result.items.map((item) => item.normalizedParameterValues)).toEqual([
      { thinking: "disabled" },
      { reasoning_effort: "high", thinking: "enabled" },
      { reasoning_effort: "max", thinking: "enabled" }
    ]);

    const disabledItem = result.items.find((item) => item.normalizedParameterValues.thinking === "disabled");
    expect(disabledItem?.requestParameters).toEqual({});
    expect(disabledItem?.generatedConfigSummary).toBe("");
  });
});
