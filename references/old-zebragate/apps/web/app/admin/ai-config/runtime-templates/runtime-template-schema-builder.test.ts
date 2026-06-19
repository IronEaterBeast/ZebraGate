import { describe, expect, it } from "vitest";
import {
  buildParametersObject,
  mergeParametersIntoSchemaJson,
  parseParametersFromSchemaJson,
  parseRequestParameterFragment,
  type BuilderParameter
} from "./runtime-template-schema-builder";

describe("parseRequestParameterFragment", () => {
  it("returns an empty object for empty text", () => {
    expect(parseRequestParameterFragment("")).toEqual({ value: {} });
    expect(parseRequestParameterFragment("   ")).toEqual({ value: {} });
  });

  it("parses a valid JSON object", () => {
    expect(parseRequestParameterFragment('{"thinking":{"type":"enabled"}}')).toEqual({
      value: { thinking: { type: "enabled" } }
    });
  });

  it("returns an error for invalid JSON", () => {
    const result = parseRequestParameterFragment("{ invalid");
    expect("error" in result).toBe(true);
  });

  it("returns an error when the JSON is not an object", () => {
    expect("error" in parseRequestParameterFragment("[1,2,3]")).toBe(true);
    expect("error" in parseRequestParameterFragment('"text"')).toBe(true);
  });
});

describe("buildParametersObject", () => {
  it("returns an empty object for no parameters", () => {
    expect(buildParametersObject([])).toEqual({});
  });

  it("builds a single parameter with a single option", () => {
    const parameters: BuilderParameter[] = [
      {
        key: "thinking",
        label: "Thinking",
        options: [
          {
            internalKey: "disabled",
            summary: "",
            creditMultiplierDelta: "0",
            requestParameterFragmentJson: "",
            dependsOn: []
          }
        ]
      }
    ];

    expect(buildParametersObject(parameters)).toEqual({
      thinking: {
        label: "Thinking",
        options: [
          {
            internalKey: "disabled",
            summary: "",
            requestParameterFragment: {},
            creditMultiplierDelta: 0
          }
        ]
      }
    });
  });

  it("treats an empty or non-numeric creditMultiplierDelta as 0", () => {
    const parameters: BuilderParameter[] = [
      {
        key: "thinking",
        label: "Thinking",
        options: [
          {
            internalKey: "enabled",
            summary: "思考",
            creditMultiplierDelta: "not-a-number",
            requestParameterFragmentJson: '{"thinking":{"type":"enabled"}}',
            dependsOn: []
          }
        ]
      }
    ];

    const result = buildParametersObject(parameters) as {
      thinking: { options: Array<{ creditMultiplierDelta: number; requestParameterFragment: unknown }> };
    };

    expect(result.thinking.options[0]?.creditMultiplierDelta).toBe(0);
    expect(result.thinking.options[0]?.requestParameterFragment).toEqual({ thinking: { type: "enabled" } });
  });

  it("builds multiple parameters with dependsOn referencing another parameter's option", () => {
    const parameters: BuilderParameter[] = [
      {
        key: "thinking",
        label: "Thinking",
        options: [
          {
            internalKey: "enabled",
            summary: "思考",
            creditMultiplierDelta: "0.3",
            requestParameterFragmentJson: '{"thinking":{"type":"enabled"}}',
            dependsOn: []
          }
        ]
      },
      {
        key: "reasoning_effort",
        label: "Reasoning Effort",
        options: [
          {
            internalKey: "max",
            summary: "强度最大",
            creditMultiplierDelta: "0.8",
            requestParameterFragmentJson: '{"reasoning_effort":"max"}',
            dependsOn: [{ paramKey: "thinking", internalKey: "enabled" }]
          }
        ]
      }
    ];

    const result = buildParametersObject(parameters) as Record<
      string,
      { options: Array<Record<string, unknown>> }
    >;

    expect(result.reasoning_effort?.options[0]?.dependsOn).toEqual({ thinking: "enabled" });
    expect(result.thinking?.options[0]?.dependsOn).toBeUndefined();
  });
});

describe("parseParametersFromSchemaJson", () => {
  it("returns an empty array for invalid JSON", () => {
    expect(parseParametersFromSchemaJson("{ invalid")).toEqual([]);
  });

  it("returns an empty array when there is no parameters field", () => {
    expect(parseParametersFromSchemaJson(JSON.stringify({ requestDefaults: {} }))).toEqual([]);
  });

  it("round-trips a schema produced by buildParametersObject back into BuilderParameter form", () => {
    const parameters: BuilderParameter[] = [
      {
        key: "thinking",
        label: "Thinking",
        options: [
          {
            internalKey: "disabled",
            summary: "",
            creditMultiplierDelta: "",
            requestParameterFragmentJson: "",
            dependsOn: []
          },
          {
            internalKey: "enabled",
            summary: "思考",
            creditMultiplierDelta: "0.3",
            requestParameterFragmentJson: '{"thinking":{"type":"enabled"}}',
            dependsOn: []
          }
        ]
      },
      {
        key: "reasoning_effort",
        label: "Reasoning Effort",
        options: [
          {
            internalKey: "max",
            summary: "强度最大",
            creditMultiplierDelta: "0.8",
            requestParameterFragmentJson: '{"reasoning_effort":"max"}',
            dependsOn: [{ paramKey: "thinking", internalKey: "enabled" }]
          }
        ]
      }
    ];

    const schemaJson = mergeParametersIntoSchemaJson("", parameters);
    const loaded = parseParametersFromSchemaJson(schemaJson);

    expect(loaded).toEqual(parameters);
  });
});

describe("mergeParametersIntoSchemaJson", () => {
  const parameters: BuilderParameter[] = [
    {
      key: "thinking",
      label: "Thinking",
      options: [
        {
          internalKey: "disabled",
          summary: "",
          creditMultiplierDelta: "0",
          requestParameterFragmentJson: "",
          dependsOn: []
        }
      ]
    }
  ];

  it("replaces parameters when the current text is empty", () => {
    const result = JSON.parse(mergeParametersIntoSchemaJson("", parameters));
    expect(result).toEqual({
      parameters: {
        thinking: {
          label: "Thinking",
          options: [
            {
              internalKey: "disabled",
              summary: "",
              requestParameterFragment: {},
              creditMultiplierDelta: 0
            }
          ]
        }
      }
    });
  });

  it("replaces parameters when the current text is invalid JSON", () => {
    const result = JSON.parse(mergeParametersIntoSchemaJson("{ invalid json", parameters));
    expect(result.parameters).toEqual(buildParametersObject(parameters));
  });

  it("preserves other top-level fields while replacing parameters", () => {
    const currentJsonText = JSON.stringify({
      parameters: { old: { label: "Old", options: [] } },
      requestDefaults: { temperature: 0.7 },
      creditBaseMultiplier: null,
      creditCombinationRules: [{ when: { thinking: "enabled" }, delta: 0.2 }]
    });

    const result = JSON.parse(mergeParametersIntoSchemaJson(currentJsonText, parameters));

    expect(result.parameters).toEqual(buildParametersObject(parameters));
    expect(result.requestDefaults).toEqual({ temperature: 0.7 });
    expect(result.creditBaseMultiplier).toBeNull();
    expect(result.creditCombinationRules).toEqual([{ when: { thinking: "enabled" }, delta: 0.2 }]);
  });
});
