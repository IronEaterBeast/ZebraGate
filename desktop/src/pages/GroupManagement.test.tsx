import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import {
  GroupManagementPage,
  canDeleteSelectedGroup,
  formatModelCatalogFetchedAt,
  formatUnavailableModelNoticeText,
  sortModelsByName,
  shouldConfirmRecentGroupUse
} from "./GroupManagement";
import type { DesktopGroupSummary } from "../lib/api-client";

const t = i18n.getFixedT(null, null);

function createGroups(): DesktopGroupSummary[] {
  return [
    {
      id: "group-default",
      name: "default",
      localKey: "zg-local-test",
      lastUsedAt: null,
      isDefault: true,
      selectedModelCount: 0
    },
    {
      id: "group-other",
      name: "other",
      localKey: "zg-local-other",
      lastUsedAt: null,
      isDefault: false,
      selectedModelCount: 1
    }
  ];
}

function createModels(): string[] {
  return ["model-a"];
}

describe("GroupManagementPage", () => {
  it("renders the group dropdown, key, and create-group control", () => {
    const groups = createGroups();
    const html = renderToStaticMarkup(
      <GroupManagementPage
        models={createModels()}
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
        onClearUnavailableModelNotices={async () => undefined}
        privacyProtectionEnabled={true}
        isTogglingPrivacyProtection={false}
        onTogglePrivacyProtection={async () => undefined}
        refreshFeedback={null}
        refreshFeedbackKind="success"
        selectedModels={["model-a"]}
        selectedGroup={groups[0]}
        unavailableModelNotices={[]}
      />
    );

    expect(html).toContain("分组管理");
    expect(html).toContain("model 列表更新时间");
    expect(html).toContain("刷新 model 列表");
    expect(html).toContain("default（已选 0）");
    expect(html).toContain("other（已选 1）");
    expect(html).toContain("zg-local-test");
    expect(html).toContain("最后使用");
    expect(html).toContain("从未使用");
    expect(html).toContain("新建分组");
    expect(html).not.toContain("（默认）");
    expect(html).not.toContain("未选择任何 model");
    expect(html.indexOf("model 列表更新时间")).toBeGreaterThan(html.indexOf("分组名"));
  });

  it("renders the privacy protection toggle reflecting the current state", () => {
    const groups = createGroups();

    function renderWithPrivacy(enabled: boolean): string {
      return renderToStaticMarkup(
        <GroupManagementPage
          models={createModels()}
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
          onClearUnavailableModelNotices={async () => undefined}
          privacyProtectionEnabled={enabled}
          isTogglingPrivacyProtection={false}
          onTogglePrivacyProtection={async () => undefined}
          refreshFeedback={null}
          refreshFeedbackKind="success"
          selectedModels={["model-a"]}
          selectedGroup={groups[0]}
          unavailableModelNotices={[]}
        />
      );
    }

    const enabledHtml = renderWithPrivacy(true);
    // 文案与开关状态都要正确：用户必须能看到「隐私保护」这一会拦截自身请求的能力，并知道其作用。
    expect(enabledHtml).toContain("隐私保护");
    expect(enabledHtml).toContain("命中敏感关键词的请求将被本地拦截");
    expect(enabledHtml).toContain('class="privacy-protection-toggle"');
    expect(enabledHtml).toContain('type="checkbox" checked');

    const disabledHtml = renderWithPrivacy(false);
    // 关闭态：复选框不应带 checked 属性。
    const toggleStart = disabledHtml.indexOf('class="privacy-protection-toggle"');
    const toggleSegment = disabledHtml.slice(toggleStart, toggleStart + 200);
    expect(toggleSegment).not.toContain("checked");
  });

  it("shows the standard empty-selection notice when no models are selected", () => {
    const groups = createGroups();
    const html = renderToStaticMarkup(
      <GroupManagementPage
        models={createModels()}
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
        onClearUnavailableModelNotices={async () => undefined}
        privacyProtectionEnabled={true}
        isTogglingPrivacyProtection={false}
        onTogglePrivacyProtection={async () => undefined}
        refreshFeedback={null}
        refreshFeedbackKind="success"
        selectedModels={[]}
        selectedGroup={groups[0]}
        unavailableModelNotices={[]}
      />
    );

    expect(html).toContain("未选择任何 model");
  });

  it("renders models sorted by name by default", () => {
    const groups = createGroups();
    const models = ["Zeta", "Alpha", "Model 2", "Model 10"];

    const html = renderToStaticMarkup(
      <GroupManagementPage
        models={models}
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
        onClearUnavailableModelNotices={async () => undefined}
        privacyProtectionEnabled={true}
        isTogglingPrivacyProtection={false}
        onTogglePrivacyProtection={async () => undefined}
        refreshFeedback={null}
        refreshFeedbackKind="success"
        selectedModels={["Alpha"]}
        selectedGroup={groups[0]}
        unavailableModelNotices={[]}
      />
    );

    expect(html.indexOf("Alpha")).toBeLessThan(html.indexOf("Model 2"));
    expect(html.indexOf("Model 2")).toBeLessThan(html.indexOf("Model 10"));
    expect(html.indexOf("Model 10")).toBeLessThan(html.indexOf("Zeta"));
  });

  it("sorts models without mutating the original list", () => {
    const models = ["Beta", "Alpha"];

    expect(sortModelsByName(models)).toEqual(["Alpha", "Beta"]);
    expect(models).toEqual(["Beta", "Alpha"]);
  });

  it("renders catalog freshness and manual refresh feedback", () => {
    const groups = createGroups();
    const html = renderToStaticMarkup(
      <GroupManagementPage
        models={[]}
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
        onClearUnavailableModelNotices={async () => undefined}
        privacyProtectionEnabled={true}
        isTogglingPrivacyProtection={false}
        onTogglePrivacyProtection={async () => undefined}
        refreshFeedback="刷新失败，请稍后重试"
        refreshFeedbackKind="error"
        selectedModels={[]}
        selectedGroup={groups[0]}
        unavailableModelNotices={[{ groupName: "default", modelNames: ["model-old"] }]}
      />
    );

    expect(html).toContain("model 列表更新时间");
    expect(html).toContain("从未更新");
    expect(html).toContain("model 列表已超过 2 天未更新，可能影响当前使用。");
    expect(html).toContain("刷新失败，请稍后重试");
    expect(html).toContain("refresh-feedback-error");
    expect(html).toContain("以下 model 已不再可用");
    expect(html).toContain("default");
    expect(html).toContain("model-old");
    expect(html).toContain("确认");
    expect(html).toContain("复制");
  });

  it("formats a missing catalog update time as never updated", () => {
    expect(formatModelCatalogFetchedAt(t, null)).toBe("从未更新");
  });

  it("formats unavailable model notices for copying", () => {
    expect(
      formatUnavailableModelNoticeText(t, [
        { groupName: "default", modelNames: ["model-old", "model-older"] },
        { groupName: "other", modelNames: ["model-gone"] }
      ])
    ).toBe(
      [
        "以下 model 已不再可用，并已从分组中移除，可能影响生成效果：",
        "default：model-old、model-older",
        "other：model-gone"
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
