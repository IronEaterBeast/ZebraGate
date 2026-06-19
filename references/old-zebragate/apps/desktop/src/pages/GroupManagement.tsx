import { useEffect, useMemo, useState } from "react";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import {
  createGroup,
  deleteGroup,
  renameGroup,
  type DesktopGroupSummary,
  type PublicAiOption,
  type UnavailableAiOptionNotice
} from "../lib/api-client";
import { formatGroupLastUsedAt } from "../lib/group-usage";

const RECENT_GROUP_USE_CONFIRMATION_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export function shouldConfirmRecentGroupUse(lastUsedAt: number | null, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return lastUsedAt !== null && nowSeconds - lastUsedAt <= RECENT_GROUP_USE_CONFIRMATION_WINDOW_SECONDS;
}

export function canDeleteSelectedGroup(groups: DesktopGroupSummary[], selectedGroup: DesktopGroupSummary | null): boolean {
  return selectedGroup !== null && groups.length > 1;
}

export function formatAiOptionCatalogFetchedAt(fetchedAt: number | null): string {
  if (fetchedAt === null) {
    return "从未更新";
  }

  return new Date(fetchedAt * 1000).toLocaleString();
}

export function formatUnavailableAiOptionNoticeText(notices: UnavailableAiOptionNotice[]): string {
  return [
    "以下 AI 已不再可用，并已从分组中移除，可能影响生成效果：",
    ...notices.map((notice) => `${notice.groupName}：${notice.aiOptionNames.join("、")}`)
  ].join("\n");
}

export function sortAiOptionsByName(aiOptions: PublicAiOption[]): PublicAiOption[] {
  return [...aiOptions].sort((left, right) => {
    const nameComparison = left.publicName.localeCompare(right.publicName, "zh-CN", {
      numeric: true,
      sensitivity: "base"
    });

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.aiOptionId.localeCompare(right.aiOptionId);
  });
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="icon-button" onClick={() => void handleCopy()} title="Copy" type="button">
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function GroupManagementPage({
  aiOptions,
  catalogError,
  catalogFetchedAt,
  groups,
  isCatalogStale,
  isLoading,
  isRefreshingCatalog,
  onGroupCreated,
  onGroupDeleted,
  onGroupUpdated,
  onRefreshCatalog,
  onSaveSelection,
  onSelectGroup,
  onClearUnavailableAiOptionNotices,
  refreshFeedback,
  refreshFeedbackKind,
  selectedAiOptionIds,
  selectedGroup,
  unavailableAiOptionNotices
}: {
  aiOptions: PublicAiOption[];
  catalogError: string | null;
  catalogFetchedAt: number | null;
  groups: DesktopGroupSummary[];
  isCatalogStale: boolean;
  isLoading: boolean;
  isRefreshingCatalog: boolean;
  onGroupCreated: (group: DesktopGroupSummary) => void;
  onGroupDeleted: (groupId: string) => void;
  onGroupUpdated: (group: DesktopGroupSummary) => void;
  onRefreshCatalog: () => Promise<void>;
  onSaveSelection: (selectedAiOptionIds: string[]) => Promise<void>;
  onSelectGroup: (groupId: string) => void;
  onClearUnavailableAiOptionNotices: () => Promise<void>;
  refreshFeedback: string | null;
  refreshFeedbackKind: "success" | "error";
  selectedAiOptionIds: string[];
  selectedGroup: DesktopGroupSummary | null;
  unavailableAiOptionNotices: UnavailableAiOptionNotice[];
}) {
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [isSavingNewGroup, setIsSavingNewGroup] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isClearingUnavailableAiOptionNotices, setIsClearingUnavailableAiOptionNotices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingAiOptionIds, setSavingAiOptionIds] = useState<string[]>([]);

  const unavailableAiOptionNoticeText = useMemo(
    () => formatUnavailableAiOptionNoticeText(unavailableAiOptionNotices),
    [unavailableAiOptionNotices]
  );

  const selectableAiOptionIds = useMemo(
    () => aiOptions.filter((option) => option.status !== "disabled").map((option) => option.aiOptionId),
    [aiOptions]
  );
  const sortedAiOptions = useMemo(() => sortAiOptionsByName(aiOptions), [aiOptions]);

  useEffect(() => {
    setIsRenaming(false);
  }, [selectedGroup?.id]);

  function openCreateGroupDialog(): void {
    setNewGroupName("");
    setIsCreatingGroup(true);
  }

  async function handleCreateGroup(): Promise<void> {
    const name = newGroupName.trim();
    if (!name) {
      return;
    }
    try {
      setIsSavingNewGroup(true);
      setError(null);
      const group = await createGroup(name);
      onGroupCreated(group);
      setIsCreatingGroup(false);
      setNewGroupName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create group.");
    } finally {
      setIsSavingNewGroup(false);
    }
  }

  function startRename(): void {
    if (!selectedGroup) {
      return;
    }
    setRenameValue(selectedGroup.name);
    setIsRenaming(true);
  }

  async function handleConfirmRename(): Promise<void> {
    if (!selectedGroup) {
      return;
    }
    const name = renameValue.trim();
    if (!name || name === selectedGroup.name) {
      setIsRenaming(false);
      return;
    }
    try {
      setIsBusy(true);
      setError(null);
      await renameGroup(selectedGroup.id, name);
      onGroupUpdated({ ...selectedGroup, name });
      setIsRenaming(false);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Failed to rename group.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteGroup(): Promise<void> {
    if (!selectedGroup) {
      return;
    }
    if (!canDeleteSelectedGroup(groups, selectedGroup)) {
      await message("只剩最后一个分组时不能删除。", { title: "无法删除", kind: "warning" });
      return;
    }
    const confirmed = await confirm(`确定要删除分组"${selectedGroup.name}"吗？该操作无法撤销。`, {
      title: "删除分组",
      kind: "warning"
    });
    if (!confirmed) {
      return;
    }
    if (shouldConfirmRecentGroupUse(selectedGroup.lastUsedAt)) {
      const recentlyUsedConfirmed = await confirm(
        `分组"${selectedGroup.name}"在最近 7 天内被客户端使用过。删除后，正在使用该分组密钥的软件需要重新配置。仍然删除吗？`,
        {
          title: "确认删除近期使用的分组",
          kind: "warning"
        }
      );
      if (!recentlyUsedConfirmed) {
        return;
      }
    }
    try {
      setIsBusy(true);
      setError(null);
      await deleteGroup(selectedGroup.id);
      onGroupDeleted(selectedGroup.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete group.");
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleAiOption(aiOptionId: string): Promise<void> {
    if (!selectableAiOptionIds.includes(aiOptionId)) {
      return;
    }

    const nextSelectedAiOptionIds = selectedAiOptionIds.includes(aiOptionId)
      ? selectedAiOptionIds.filter((id) => id !== aiOptionId)
      : [...selectedAiOptionIds, aiOptionId];

    try {
      setSavingAiOptionIds((current) => [...current, aiOptionId]);
      setError(null);
      await onSaveSelection(nextSelectedAiOptionIds);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save AI option selection.");
    } finally {
      setSavingAiOptionIds((current) => current.filter((id) => id !== aiOptionId));
    }
  }

  async function handleClearUnavailableAiOptionNotices(): Promise<void> {
    try {
      setIsClearingUnavailableAiOptionNotices(true);
      setError(null);
      await onClearUnavailableAiOptionNotices();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear unavailable AI option notices.");
    } finally {
      setIsClearingUnavailableAiOptionNotices(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="title-bar">
        <span className="account-name">分组管理</span>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {catalogError ? <div className="error-banner">{catalogError}</div> : null}
      {isCatalogStale ? <div className="warning-banner">AI 列表已超过 2 天未更新，可能影响当前使用。</div> : null}
      {unavailableAiOptionNotices.length > 0 ? (
        <div className="unavailable-notice-banner">
          <div className="unavailable-notice-header">
            <span className="unavailable-notice-icon">⚠</span>
            <span className="unavailable-notice-title">以下 AI 已不再可用，并已从分组中移除，可能影响生成效果</span>
          </div>
          <ul className="unavailable-notice-list">
            {unavailableAiOptionNotices.map((notice) => (
              <li key={notice.groupName}>
                <span className="unavailable-notice-group">{notice.groupName}</span>：<span className="unavailable-notice-names">{notice.aiOptionNames.join("、")}</span>
              </li>
            ))}
          </ul>
          <div className="unavailable-notice-actions">
            <CopyButton value={unavailableAiOptionNoticeText} />
            <button
              className="icon-button"
              disabled={isClearingUnavailableAiOptionNotices}
              onClick={() => void handleClearUnavailableAiOptionNotices()}
              type="button"
            >
              {isClearingUnavailableAiOptionNotices ? "确认中…" : "确认"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="info-list">
        <div className="info-row">
          <span className="info-label">分组</span>
          <select
            className="info-value"
            disabled={isBusy || groups.length === 0}
            onChange={(event) => onSelectGroup(event.target.value)}
            value={selectedGroup?.id ?? ""}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}（已选 {group.selectedAiOptionCount}）
              </option>
            ))}
          </select>
          <button className="icon-button" disabled={isBusy} onClick={openCreateGroupDialog} type="button">
            新建分组
          </button>
        </div>

        {isCreatingGroup ? (
          <div className="group-management-panel">
            <div className="group-management-item">
              <input
                className="text-input group-name-input"
                disabled={isSavingNewGroup}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="新分组名称"
                value={newGroupName}
              />
              <button
                className="icon-button"
                disabled={isSavingNewGroup || !newGroupName.trim()}
                onClick={() => void handleCreateGroup()}
                type="button"
              >
                新建分组并立刻配置
              </button>
              <button
                className="icon-button"
                disabled={isSavingNewGroup}
                onClick={() => setIsCreatingGroup(false)}
                type="button"
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

        {selectedGroup ? (
          <>
            <div className="info-row">
              <span className="info-label">Key</span>
              <span className="info-value">{selectedGroup.localKey}</span>
              <CopyButton value={selectedGroup.localKey} />
            </div>
            <div className="info-row">
              <span className="info-label">最后使用</span>
              <span className="info-value">{formatGroupLastUsedAt(selectedGroup.lastUsedAt)}</span>
              <span />
            </div>
            <div className="info-row">
              <span className="info-label">分组名</span>
              {isRenaming ? (
                <>
                  <input
                    className="text-input group-name-input"
                    disabled={isBusy}
                    onChange={(event) => setRenameValue(event.target.value)}
                    value={renameValue}
                  />
                  <div className="title-bar-actions">
                    <button className="icon-button" disabled={isBusy} onClick={() => void handleConfirmRename()} type="button">
                      保存
                    </button>
                    <button className="icon-button" disabled={isBusy} onClick={() => setIsRenaming(false)} type="button">
                      取消
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="info-value">
                    {selectedGroup.name}
                  </span>
                  <div className="title-bar-actions">
                    <button className="icon-button" disabled={isBusy} onClick={startRename} type="button">
                      重命名
                    </button>
                    <button
                      className="icon-button"
                      disabled={isBusy || !canDeleteSelectedGroup(groups, selectedGroup)}
                      onClick={() => void handleDeleteGroup()}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="info-row">
              <span className="info-label">AI 列表更新时间</span>
              <span className="info-value">{formatAiOptionCatalogFetchedAt(catalogFetchedAt)}</span>
              <div className="title-bar-actions">
                <button
                  className="icon-button"
                  disabled={isRefreshingCatalog}
                  onClick={() => void onRefreshCatalog()}
                  type="button"
                >
                  {isRefreshingCatalog ? "刷新中" : "刷新 AI 列表"}
                </button>
                {refreshFeedback ? (
                  <span className={refreshFeedbackKind === "error" ? "refresh-feedback-error" : "muted"}>
                    {refreshFeedback}
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {isLoading ? (
          <div className="muted ai-option-row">加载中...</div>
        ) : (
          <>
            {!catalogError && aiOptions.length === 0 ? (
              <div className="warning-banner">暂无可用 AI，请联网后刷新。</div>
            ) : null}
            {!catalogError && aiOptions.length > 0 && selectedAiOptionIds.length === 0 ? (
              <div className="warning-banner">未选择任何 AI，将无法处理请求，请至少选择一个 AI。</div>
            ) : null}
            {sortedAiOptions.map((option) => {
              const isSelectable = selectableAiOptionIds.includes(option.aiOptionId);
              const isSaving = savingAiOptionIds.includes(option.aiOptionId);
              const statusLabel = option.status === "healthy" ? "可用" : option.status === "degraded" ? "降级" : option.status === "disabled" ? "已禁用" : "未知";
              return (
                <label key={option.aiOptionId} className={`provider-card ai-option-row${!isSelectable ? " ai-option-row--disabled" : ""}`}>
                  <div className="provider-checkbox">
                    <input
                      checked={selectedAiOptionIds.includes(option.aiOptionId)}
                      disabled={!isSelectable || isSaving}
                      onChange={() => void toggleAiOption(option.aiOptionId)}
                      type="checkbox"
                    />
                  </div>
                  <div className="ai-option-body">
                    <div className="ai-option-name-row">
                      <strong className="ai-option-name">{option.publicName}</strong>
                      <span className={`ai-option-status-badge ai-option-status-badge--${option.status}`}>{statusLabel}</span>
                    </div>
                    <div className="ai-option-meta">
                      <span>{option.providerLabel}</span>
                      <span className="ai-option-meta-sep">·</span>
                      <span>{option.modelLabel}</span>
                      <span className="ai-option-meta-sep">·</span>
                      <span>消耗倍率 {option.creditMultiplier}x</span>
                    </div>
                    {option.displayConfigSummary ? (
                      <div className="ai-option-config-summary muted">{option.displayConfigSummary}</div>
                    ) : null}
                    {!isSelectable ? (
                      <div className="ai-option-disable-reason">
                        {option.disableReason ?? "该 AI 已被管理员禁用，无法选择。"}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
