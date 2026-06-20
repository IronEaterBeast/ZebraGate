import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import {
  createGroup,
  deleteGroup,
  renameGroup,
  type DesktopGroupSummary,
  type UnavailableModelNotice
} from "../lib/api-client";
import { formatGroupLastUsedAt } from "../lib/group-usage";

const RECENT_GROUP_USE_CONFIRMATION_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export function shouldConfirmRecentGroupUse(lastUsedAt: number | null, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return lastUsedAt !== null && nowSeconds - lastUsedAt <= RECENT_GROUP_USE_CONFIRMATION_WINDOW_SECONDS;
}

export function canDeleteSelectedGroup(groups: DesktopGroupSummary[], selectedGroup: DesktopGroupSummary | null): boolean {
  return selectedGroup !== null && groups.length > 1;
}

export function formatModelCatalogFetchedAt(t: TFunction, fetchedAt: number | null): string {
  if (fetchedAt === null) {
    return t("group.catalogNeverUpdated");
  }

  return new Date(fetchedAt * 1000).toLocaleString();
}

export function formatUnavailableModelNoticeText(t: TFunction, notices: UnavailableModelNotice[]): string {
  return [
    t("group.unavailableModelText"),
    ...notices.map((notice) =>
      t("group.unavailableModelLine", {
        groupName: notice.groupName,
        modelNames: notice.modelNames.join(t("group.modelNameSeparator"))
      })
    )
  ].join("\n");
}

export function sortModelsByName(models: string[]): string[] {
  return [...models].sort((left, right) =>
    left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" })
  );
}

function CopyButton({ value }: { value: string }) {
  const { t } = useTranslation();
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
    <button className="icon-button" onClick={() => void handleCopy()} title={t("common.copy")} type="button">
      {copied ? t("common.copied") : t("common.copy")}
    </button>
  );
}

export function GroupManagementPage({
  models,
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
  onClearUnavailableModelNotices,
  refreshFeedback,
  refreshFeedbackKind,
  selectedModels,
  selectedGroup,
  unavailableModelNotices
}: {
  models: string[];
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
  onSaveSelection: (selectedModels: string[]) => Promise<void>;
  onSelectGroup: (groupId: string) => void;
  onClearUnavailableModelNotices: () => Promise<void>;
  refreshFeedback: string | null;
  refreshFeedbackKind: "success" | "error";
  selectedModels: string[];
  selectedGroup: DesktopGroupSummary | null;
  unavailableModelNotices: UnavailableModelNotice[];
}) {
  const { t } = useTranslation();
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [isSavingNewGroup, setIsSavingNewGroup] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isClearingUnavailableModelNotices, setIsClearingUnavailableModelNotices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingModels, setSavingModels] = useState<string[]>([]);

  const unavailableModelNoticeText = useMemo(
    () => formatUnavailableModelNoticeText(t, unavailableModelNotices),
    [t, unavailableModelNotices]
  );

  const sortedModels = useMemo(() => sortModelsByName(models), [models]);

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
      await message(t("group.cannotDeleteLastMessage"), { title: t("group.cannotDeleteTitle"), kind: "warning" });
      return;
    }
    const confirmed = await confirm(t("group.deleteConfirmMessage", { name: selectedGroup.name }), {
      title: t("group.deleteConfirmTitle"),
      kind: "warning"
    });
    if (!confirmed) {
      return;
    }
    if (shouldConfirmRecentGroupUse(selectedGroup.lastUsedAt)) {
      const recentlyUsedConfirmed = await confirm(
        t("group.deleteRecentConfirmMessage", { name: selectedGroup.name }),
        {
          title: t("group.deleteRecentConfirmTitle"),
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

  async function toggleModel(model: string): Promise<void> {
    const nextSelectedModels = selectedModels.includes(model)
      ? selectedModels.filter((name) => name !== model)
      : [...selectedModels, model];

    try {
      setSavingModels((current) => [...current, model]);
      setError(null);
      await onSaveSelection(nextSelectedModels);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save model selection.");
    } finally {
      setSavingModels((current) => current.filter((name) => name !== model));
    }
  }

  async function handleClearUnavailableModelNotices(): Promise<void> {
    try {
      setIsClearingUnavailableModelNotices(true);
      setError(null);
      await onClearUnavailableModelNotices();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear unavailable model notices.");
    } finally {
      setIsClearingUnavailableModelNotices(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="title-bar">
        <span className="account-name">{t("group.title")}</span>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {catalogError ? <div className="error-banner">{catalogError}</div> : null}
      {isCatalogStale ? <div className="warning-banner">{t("group.catalogStaleWarning")}</div> : null}
      {unavailableModelNotices.length > 0 ? (
        <div className="unavailable-notice-banner">
          <div className="unavailable-notice-header">
            <span className="unavailable-notice-icon">⚠</span>
            <span className="unavailable-notice-title">{t("group.unavailableModelTitle")}</span>
          </div>
          <ul className="unavailable-notice-list">
            {unavailableModelNotices.map((notice) => (
              <li key={notice.groupName}>
                <span className="unavailable-notice-group">{notice.groupName}</span>
                {t("group.groupModelSeparator")}
                <span className="unavailable-notice-names">{notice.modelNames.join(t("group.modelNameSeparator"))}</span>
              </li>
            ))}
          </ul>
          <div className="unavailable-notice-actions">
            <CopyButton value={unavailableModelNoticeText} />
            <button
              className="icon-button"
              disabled={isClearingUnavailableModelNotices}
              onClick={() => void handleClearUnavailableModelNotices()}
              type="button"
            >
              {isClearingUnavailableModelNotices ? t("common.confirming") : t("common.confirm")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="info-list">
        <div className="info-row">
          <span className="info-label">{t("group.group")}</span>
          <select
            className="info-value"
            disabled={isBusy || groups.length === 0}
            onChange={(event) => onSelectGroup(event.target.value)}
            value={selectedGroup?.id ?? ""}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {t("group.groupOption", { name: group.name, count: group.selectedModelCount })}
              </option>
            ))}
          </select>
          <button className="icon-button" disabled={isBusy} onClick={openCreateGroupDialog} type="button">
            {t("group.createGroup")}
          </button>
        </div>

        {isCreatingGroup ? (
          <div className="group-management-panel">
            <div className="group-management-item">
              <input
                className="text-input group-name-input"
                disabled={isSavingNewGroup}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder={t("group.newGroupNamePlaceholder")}
                value={newGroupName}
              />
              <button
                className="icon-button"
                disabled={isSavingNewGroup || !newGroupName.trim()}
                onClick={() => void handleCreateGroup()}
                type="button"
              >
                {t("group.createGroupAndConfigure")}
              </button>
              <button
                className="icon-button"
                disabled={isSavingNewGroup}
                onClick={() => setIsCreatingGroup(false)}
                type="button"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : null}

        {selectedGroup ? (
          <>
            <div className="info-row">
              <span className="info-label">{t("group.key")}</span>
              <span className="info-value">{selectedGroup.localKey}</span>
              <CopyButton value={selectedGroup.localKey} />
            </div>
            <div className="info-row">
              <span className="info-label">{t("group.lastUsed")}</span>
              <span className="info-value">{formatGroupLastUsedAt(t, selectedGroup.lastUsedAt)}</span>
              <span />
            </div>
            <div className="info-row">
              <span className="info-label">{t("group.groupName")}</span>
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
                      {t("common.save")}
                    </button>
                    <button className="icon-button" disabled={isBusy} onClick={() => setIsRenaming(false)} type="button">
                      {t("common.cancel")}
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
                      {t("group.rename")}
                    </button>
                    <button
                      className="icon-button"
                      disabled={isBusy || !canDeleteSelectedGroup(groups, selectedGroup)}
                      onClick={() => void handleDeleteGroup()}
                      type="button"
                    >
                      {t("group.delete")}
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="info-row">
              <span className="info-label">{t("group.modelCatalogUpdatedAt")}</span>
              <span className="info-value">{formatModelCatalogFetchedAt(t, catalogFetchedAt)}</span>
              <div className="title-bar-actions">
                <button
                  className="icon-button"
                  disabled={isRefreshingCatalog}
                  onClick={() => void onRefreshCatalog()}
                  type="button"
                >
                  {isRefreshingCatalog ? t("group.refreshing") : t("group.refreshModelCatalog")}
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
          <div className="muted ai-option-row">{t("group.loading")}</div>
        ) : (
          <>
            {!catalogError && models.length === 0 ? (
              <div className="warning-banner">{t("group.noModelWarning")}</div>
            ) : null}
            {!catalogError && models.length > 0 && selectedModels.length === 0 ? (
              <div className="warning-banner">{t("group.noModelSelectedWarning")}</div>
            ) : null}
            {sortedModels.map((model) => {
              const isSaving = savingModels.includes(model);
              return (
                <label key={model} className="provider-card ai-option-row">
                  <div className="provider-checkbox">
                    <input
                      checked={selectedModels.includes(model)}
                      disabled={isSaving}
                      onChange={() => void toggleModel(model)}
                      type="checkbox"
                    />
                  </div>
                  <div className="ai-option-body">
                    <div className="ai-option-name-row">
                      <strong className="ai-option-name">{model}</strong>
                    </div>
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
