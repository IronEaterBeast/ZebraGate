import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GroupManagementPage,
  canDeleteSelectedGroup,
  formatAiOptionCatalogFetchedAt,
  formatUnavailableAiOptionNoticeText,
  sortAiOptionsByName,
  shouldConfirmRecentGroupUse
} from "./GroupManagement";
import type { DesktopGroupSummary, PublicAiOption } from "../lib/api-client";

function createGroups(): DesktopGroupSummary[] {
  return [
    {
      id: "group-default",
      name: "default",
      localKey: "zg-local-test",
      lastUsedAt: null,
      isDefault: true,
      selectedAiOptionCount: 0
    },
    {
      id: "group-other",
      name: "other",
      localKey: "zg-local-other",
      lastUsedAt: null,
      isDefault: false,
      selectedAiOptionCount: 1
    }
  ];
}

function createAiOptions(): PublicAiOption[] {
  return [
    {
      aiOptionId: "ai-1",
      providerLabel: "provider-a",
      modelLabel: "model-a",
      publicName: "AI One",
      displayConfigSummary: "summary-a",
      displayBadges: [],
      creditMultiplier: 1,
      isRecommended: false,
      status: "healthy",
      sortOrder: 0
    }
  ];
}

describe("GroupManagementPage", () => {
  it("renders the group dropdown, key, and create-group control", () => {
    const groups = createGroups();
    const html = renderToStaticMarkup(
      <GroupManagementPage
        aiOptions={createAiOptions()}
        catalogError={null}
        catalogFetchedAt={1_800_000_000}
        groups={groups}
        isCatalogStale={false}
        isLoading={false}
        isRefreshingCatalog={false}
        onGroupCreated={() => undefined}
        onGroupDeleted={() => undefined}
        onGroupUpdated={() => undefined}
        onRefreshCatalog={async () => undefined}
        onSaveSelection={async () => undefined}
        onSelectGroup={() => undefined}
        onClearUnavailableAiOptionNotices={async () => undefined}
        refreshFeedback={null}
        refreshFeedbackKind="success"
        selectedAiOptionIds={["ai-1"]}
        selectedGroup={groups[0]}
        unavailableAiOptionNotices={[]}
      />
    );

    expect(html).toContain("分组管理");
    expect(html).toContain("AI 列表更新时间");
    expect(html).toContain("刷新 AI 列表");
    expect(html).toContain("default（已选 0）");
    expect(html).toContain("other（已选 1）");
    expect(html).toContain("zg-local-test");
    expect(html).toContain("最后使用");
    expect(html).toContain("从未使用");
    expect(html).toContain("新建分组");
    expect(html).not.toContain("（默认）");
    expect(html).not.toContain("未选择任何 AI");
    expect(html.indexOf("AI 列表更新时间")).toBeGreaterThan(html.indexOf("分组名"));
  });

  it("shows the standard empty-selection notice when no AI options are selected", () => {
    const groups = createGroups();
    const html = renderToStaticMarkup(
      <GroupManagementPage
        aiOptions={createAiOptions()}
        catalogError={null}
        catalogFetchedAt={1_800_000_000}
        groups={groups}
        isCatalogStale={false}
        isLoading={false}
        isRefreshingCatalog={false}
        onGroupCreated={() => undefined}
        onGroupDeleted={() => undefined}
        onGroupUpdated={() => undefined}
        onRefreshCatalog={async () => undefined}
        onSaveSelection={async () => undefined}
        onSelectGroup={() => undefined}
        onClearUnavailableAiOptionNotices={async () => undefined}
        refreshFeedback={null}
        refreshFeedbackKind="success"
        selectedAiOptionIds={[]}
        selectedGroup={groups[0]}
        unavailableAiOptionNotices={[]}
      />
    );

    expect(html).toContain("未选择任何 AI");
  });

  it("renders AI options sorted by public name by default", () => {
    const groups = createGroups();
    const aiOptions: PublicAiOption[] = [
      { ...createAiOptions()[0], aiOptionId: "ai-z", publicName: "Zeta AI" },
      { ...createAiOptions()[0], aiOptionId: "ai-a", publicName: "Alpha AI" },
      { ...createAiOptions()[0], aiOptionId: "ai-m", publicName: "Model 2 AI" },
      { ...createAiOptions()[0], aiOptionId: "ai-n", publicName: "Model 10 AI" }
    ];

    const html = renderToStaticMarkup(
      <GroupManagementPage
        aiOptions={aiOptions}
        catalogError={null}
        catalogFetchedAt={1_800_000_000}
        groups={groups}
        isCatalogStale={false}
        isLoading={false}
        isRefreshingCatalog={false}
        onGroupCreated={() => undefined}
        onGroupDeleted={() => undefined}
        onGroupUpdated={() => undefined}
        onRefreshCatalog={async () => undefined}
        onSaveSelection={async () => undefined}
        onSelectGroup={() => undefined}
        onClearUnavailableAiOptionNotices={async () => undefined}
        refreshFeedback={null}
        refreshFeedbackKind="success"
        selectedAiOptionIds={["ai-a"]}
        selectedGroup={groups[0]}
        unavailableAiOptionNotices={[]}
      />
    );

    expect(html.indexOf("Alpha AI")).toBeLessThan(html.indexOf("Model 2 AI"));
    expect(html.indexOf("Model 2 AI")).toBeLessThan(html.indexOf("Model 10 AI"));
    expect(html.indexOf("Model 10 AI")).toBeLessThan(html.indexOf("Zeta AI"));
  });

  it("sorts AI options without mutating the original list", () => {
    const aiOptions: PublicAiOption[] = [
      { ...createAiOptions()[0], aiOptionId: "ai-b", publicName: "Beta AI" },
      { ...createAiOptions()[0], aiOptionId: "ai-a", publicName: "Alpha AI" }
    ];

    expect(sortAiOptionsByName(aiOptions).map((option) => option.publicName)).toEqual(["Alpha AI", "Beta AI"]);
    expect(aiOptions.map((option) => option.publicName)).toEqual(["Beta AI", "Alpha AI"]);
  });

  it("renders catalog freshness and manual refresh feedback", () => {
    const groups = createGroups();
    const html = renderToStaticMarkup(
      <GroupManagementPage
        aiOptions={[]}
        catalogError={null}
        catalogFetchedAt={null}
        groups={groups}
        isCatalogStale={true}
        isLoading={false}
        isRefreshingCatalog={false}
        onGroupCreated={() => undefined}
        onGroupDeleted={() => undefined}
        onGroupUpdated={() => undefined}
        onRefreshCatalog={async () => undefined}
        onSaveSelection={async () => undefined}
        onSelectGroup={() => undefined}
        onClearUnavailableAiOptionNotices={async () => undefined}
        refreshFeedback="刷新失败，请稍后重试"
        refreshFeedbackKind="error"
        selectedAiOptionIds={[]}
        selectedGroup={groups[0]}
        unavailableAiOptionNotices={[{ groupName: "default", aiOptionNames: ["AI Old"] }]}
      />
    );

    expect(html).toContain("AI 列表更新时间");
    expect(html).toContain("从未更新");
    expect(html).toContain("AI 列表已超过 2 天未更新，可能影响当前使用。");
    expect(html).toContain("刷新失败，请稍后重试");
    expect(html).toContain("refresh-feedback-error");
    expect(html).toContain("以下 AI 已不再可用");
    expect(html).toContain("default");
    expect(html).toContain("AI Old");
    expect(html).toContain("确认");
    expect(html).toContain("复制");
  });

  it("formats a missing catalog update time as never updated", () => {
    expect(formatAiOptionCatalogFetchedAt(null)).toBe("从未更新");
  });

  it("formats unavailable AI option notices for copying", () => {
    expect(
      formatUnavailableAiOptionNoticeText([
        { groupName: "default", aiOptionNames: ["AI Old", "AI Older"] },
        { groupName: "other", aiOptionNames: ["AI Gone"] }
      ])
    ).toBe(
      [
        "以下 AI 已不再可用，并已从分组中移除，可能影响生成效果：",
        "default：AI Old、AI Older",
        "other：AI Gone"
      ].join("\n")
    );
  });

  it("only requires extra delete confirmation for groups used within seven days", () => {
    const nowSeconds = 1_800_000_000;

    expect(shouldConfirmRecentGroupUse(null, nowSeconds)).toBe(false);
    expect(shouldConfirmRecentGroupUse(nowSeconds - 7 * 24 * 60 * 60 - 1, nowSeconds)).toBe(false);
    expect(shouldConfirmRecentGroupUse(nowSeconds - 7 * 24 * 60 * 60, nowSeconds)).toBe(true);
    expect(shouldConfirmRecentGroupUse(nowSeconds - 7 * 24 * 60 * 60 + 1, nowSeconds)).toBe(true);
  });

  it("allows deleting any selected group except when it is the last group", () => {
    const groups = createGroups();

    expect(canDeleteSelectedGroup(groups, groups[0])).toBe(true);
    expect(canDeleteSelectedGroup([groups[0]], groups[0])).toBe(false);
    expect(canDeleteSelectedGroup(groups, null)).toBe(false);
  });
});
