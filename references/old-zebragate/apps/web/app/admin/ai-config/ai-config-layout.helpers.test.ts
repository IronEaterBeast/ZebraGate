import { describe, expect, it } from "vitest";
import {
  ALL_SELECTION,
  buildCollapseToggleHref,
  buildSelectionHref,
  buildViewStateHref,
  filterModelsByProvider,
  filterOptionsBySelection
} from "./ai-config-layout.helpers";
import type { AdminAiOptionRecord, AdminModelRecord } from "../../../lib/admin-api-client";

function buildModel(overrides: Partial<AdminModelRecord>): AdminModelRecord {
  return {
    id: "model-1",
    providerId: "provider-1",
    runtimeTemplateId: null,
    modelKey: "model-key",
    modelLabel: "Model",
    upstreamModel: "upstream-model",
    baseCreditMultiplier: 1,
    status: "active",
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
    displayBadges: null,
    isRecommended: false,
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

describe("filterModelsByProvider", () => {
  const models = [
    buildModel({ id: "model-1", providerId: "provider-1" }),
    buildModel({ id: "model-2", providerId: "provider-2" })
  ];

  it("returns all models when providerId is 'all'", () => {
    expect(filterModelsByProvider(models, ALL_SELECTION)).toEqual(models);
  });

  it("returns only models belonging to the selected provider", () => {
    expect(filterModelsByProvider(models, "provider-1")).toEqual([models[0]]);
  });

  it("returns an empty array when no model matches the provider", () => {
    expect(filterModelsByProvider(models, "provider-3")).toEqual([]);
  });
});

describe("filterOptionsBySelection", () => {
  const options = [
    buildOption({ id: "option-1", providerId: "provider-1", modelId: "model-1" }),
    buildOption({ id: "option-2", providerId: "provider-1", modelId: "model-2" }),
    buildOption({ id: "option-3", providerId: "provider-2", modelId: "model-3" })
  ];

  it("returns all options when both selections are 'all'", () => {
    expect(filterOptionsBySelection(options, ALL_SELECTION, ALL_SELECTION)).toEqual(options);
  });

  it("filters by provider when model is 'all'", () => {
    expect(filterOptionsBySelection(options, "provider-1", ALL_SELECTION)).toEqual([options[0], options[1]]);
  });

  it("filters by provider and model together", () => {
    expect(filterOptionsBySelection(options, "provider-1", "model-2")).toEqual([options[1]]);
  });

  it("filters by model even when provider is 'all'", () => {
    expect(filterOptionsBySelection(options, ALL_SELECTION, "model-3")).toEqual([options[2]]);
  });

  it("sorts the results by publicName", () => {
    const unsorted = [
      buildOption({ id: "option-b", providerId: "provider-1", modelId: "model-1", publicName: "Beta" }),
      buildOption({ id: "option-a", providerId: "provider-1", modelId: "model-1", publicName: "Alpha" }),
      buildOption({ id: "option-c", providerId: "provider-1", modelId: "model-1", publicName: "Charlie" })
    ];

    expect(filterOptionsBySelection(unsorted, ALL_SELECTION, ALL_SELECTION).map((option) => option.id)).toEqual([
      "option-a",
      "option-b",
      "option-c"
    ]);
  });
});

describe("buildSelectionHref", () => {
  const current = { providerId: "provider-1", modelId: "model-1" };

  it("omits both params when selecting 'all' for provider", () => {
    expect(buildSelectionHref("/admin/ai-config", current, { providerId: ALL_SELECTION, modelId: ALL_SELECTION })).toBe(
      "/admin/ai-config"
    );
  });

  it("sets providerId and resets modelId to all", () => {
    expect(buildSelectionHref("/admin/ai-config", current, { providerId: "provider-2", modelId: ALL_SELECTION })).toBe(
      "/admin/ai-config?providerId=provider-2"
    );
  });

  it("keeps the current providerId when only modelId changes", () => {
    expect(buildSelectionHref("/admin/ai-config", current, { modelId: "model-2" })).toBe(
      "/admin/ai-config?providerId=provider-1&modelId=model-2"
    );
  });
});

describe("buildViewStateHref", () => {
  it("returns the bare path when nothing is selected", () => {
    expect(buildViewStateHref("/admin/ai-config", { providerId: ALL_SELECTION, modelId: ALL_SELECTION })).toBe(
      "/admin/ai-config"
    );
  });

  it("includes selection and detail params together", () => {
    expect(
      buildViewStateHref("/admin/ai-config", {
        providerId: "provider-1",
        modelId: "model-1",
        detailType: "provider",
        detailId: "provider-1"
      })
    ).toBe("/admin/ai-config?providerId=provider-1&modelId=model-1&detailType=provider&detailId=provider-1");
  });

  it("includes optionAction alongside selection", () => {
    expect(
      buildViewStateHref("/admin/ai-config", {
        providerId: "provider-1",
        modelId: "model-1",
        optionAction: "create"
      })
    ).toBe("/admin/ai-config?providerId=provider-1&modelId=model-1&optionAction=create");
  });

  it("includes collapse flags when set", () => {
    expect(
      buildViewStateHref("/admin/ai-config", {
        providerId: ALL_SELECTION,
        modelId: ALL_SELECTION,
        providerCollapsed: true,
        modelCollapsed: true
      })
    ).toBe("/admin/ai-config?pc=1&mc=1");
  });
});

describe("buildCollapseToggleHref", () => {
  const state = { providerId: "provider-1", modelId: "model-1" };

  it("collapses the provider column while preserving model state", () => {
    expect(buildCollapseToggleHref("/admin/ai-config", state, "provider")).toBe(
      "/admin/ai-config?providerId=provider-1&modelId=model-1&pc=1"
    );
  });

  it("expands an already collapsed model column", () => {
    expect(buildCollapseToggleHref("/admin/ai-config", { ...state, modelCollapsed: true }, "model")).toBe(
      "/admin/ai-config?providerId=provider-1&modelId=model-1"
    );
  });
});
