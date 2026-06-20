import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearUnavailableModelNotices,
  getModelCatalog,
  getModelSelection,
  getDesktopRuntimeSnapshot,
  refreshModelCatalog,
  refreshModelCatalogSilently,
  saveModelSelection,
  type DesktopGroupSummary,
  type UnavailableModelNotice
} from "./lib/api-client";
import { GroupManagementPage } from "./pages/GroupManagement";

const GROUP_MANAGEMENT_STATE_REFRESH_INTERVAL_MS = 4000;

type RefreshFeedbackKind = "success" | "error";

function parseGroupIdFromHash(hash: string): string | null {
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) {
    return null;
  }

  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return params.get("groupId");
}

export function GroupManagementWindow() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<DesktopGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    parseGroupIdFromHash(window.location.hash)
  );
  const [models, setModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [catalogFetchedAt, setCatalogFetchedAt] = useState<number | null>(null);
  const [isCatalogStale, setIsCatalogStale] = useState(false);
  const [unavailableModelNotices, setUnavailableModelNotices] = useState<UnavailableModelNotice[]>([]);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [refreshFeedbackKind, setRefreshFeedbackKind] = useState<RefreshFeedbackKind>("success");
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    function handleHashChange(): void {
      const groupId = parseGroupIdFromHash(window.location.hash);
      if (groupId) {
        setSelectedGroupId(groupId);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    void loadGroups();
    void loadModelCatalogState();
    // 进入分组管理时主动触发一次拉取（不阻塞首屏渲染，先用缓存渲染再后台更新）。
    void performSilentCatalogRefresh();
    const interval = window.setInterval(() => {
      void loadGroups();
      void loadModelCatalogState();
    }, GROUP_MANAGEMENT_STATE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void loadModelSelectionState();
  }, [selectedGroupId]);

  async function loadGroups(): Promise<void> {
    try {
      const snapshot = await getDesktopRuntimeSnapshot();
      setGroups(snapshot.groups);
      setSelectedGroupId((current) => {
        if (current && snapshot.groups.some((group) => group.id === current)) {
          return current;
        }
        return snapshot.groups[0]?.id ?? null;
      });
    } catch (loadError) {
      setCatalogError(loadError instanceof Error ? loadError.message : "Failed to load groups.");
    }
  }

  // 是否报错由后端推导后放在快照的 catalogError 里（本地有数据则为 null）。
  // 前端不再自行拼错误文案，避免「拉取失败但本地可用」时误打扰用户。
  function applyModelCatalog(catalog: Awaited<ReturnType<typeof getModelCatalog>>): void {
    setModels(catalog.models);
    setCatalogFetchedAt(catalog.fetchedAt);
    setIsCatalogStale(catalog.isStale);
    setUnavailableModelNotices(catalog.unavailableModelNotices);
    setCatalogError(catalog.catalogError);
  }

  async function loadModelCatalogState(): Promise<void> {
    try {
      applyModelCatalog(await getModelCatalog());
    } catch (loadError) {
      // 仅在 IPC 本身异常时兜底；远程拉取的成败已体现在快照 catalogError 上。
      setCatalogError(
        loadError instanceof Error ? loadError.message : t("group.readLocalCatalogFailed")
      );
    }
  }

  async function loadModelSelectionState(): Promise<void> {
    if (!selectedGroupId) {
      setModels([]);
      setSelectedModels([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [catalog, selection] = await Promise.all([
        getModelCatalog(),
        getModelSelection(selectedGroupId)
      ]);
      applyModelCatalog(catalog);
      setSelectedModels(selection.models);
      void performSilentCatalogRefresh();
    } catch (loadError) {
      setCatalogError(
        loadError instanceof Error ? loadError.message : t("group.readLocalCatalogFailed")
      );
    } finally {
      setIsLoading(false);
    }
  }

  // 主动静默拉取：后端永不抛错，是否报错由返回快照的 catalogError 决定。
  async function performSilentCatalogRefresh(): Promise<void> {
    try {
      const catalog = await refreshModelCatalogSilently();
      applyModelCatalog(catalog);
      if (selectedGroupId) {
        const selection = await getModelSelection(selectedGroupId);
        setSelectedModels(selection.models);
      }
      await loadGroups();
    } catch {
      // 拉取走后端静默命令，理论上不抛错；IPC 异常时不打扰用户，由 stale 提示兜底。
    }
  }

  async function handleRefreshCatalog(): Promise<void> {
    try {
      setIsRefreshingCatalog(true);
      setRefreshFeedback(null);
      const catalog = await refreshModelCatalog();
      applyModelCatalog(catalog);
      if (selectedGroupId) {
        const selection = await getModelSelection(selectedGroupId);
        setSelectedModels(selection.models);
      }
      await loadGroups();
      setRefreshFeedbackKind("success");
      setRefreshFeedback(t("group.refreshSuccess"));
    } catch {
      setRefreshFeedbackKind("error");
      setRefreshFeedback(t("group.refreshFailed"));
    } finally {
      setIsRefreshingCatalog(false);
    }
  }

  async function handleSaveSelection(nextSelectedModels: string[]): Promise<void> {
    if (!selectedGroupId) {
      return;
    }
    const selection = await saveModelSelection(selectedGroupId, nextSelectedModels);
    setSelectedModels(selection.models);
    setGroups((current) =>
      current.map((group) =>
        group.id === selectedGroupId ? { ...group, selectedModelCount: selection.models.length } : group
      )
    );
  }

  async function handleClearUnavailableModelNotices(): Promise<void> {
    await clearUnavailableModelNotices();
    setUnavailableModelNotices([]);
  }

  function handleGroupCreated(group: DesktopGroupSummary): void {
    setGroups((current) => [...current, group]);
    setSelectedGroupId(group.id);
  }

  function handleGroupUpdated(updatedGroup: DesktopGroupSummary): void {
    setGroups((current) => current.map((group) => (group.id === updatedGroup.id ? updatedGroup : group)));
  }

  function handleGroupDeleted(groupId: string): void {
    setGroups((current) => {
      const remaining = current.filter((group) => group.id !== groupId);
      if (selectedGroupId === groupId) {
        setSelectedGroupId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  }

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  return (
    <GroupManagementPage
      models={models}
      catalogError={catalogError}
      catalogFetchedAt={catalogFetchedAt}
      groups={groups}
      isCatalogStale={isCatalogStale}
      isLoading={isLoading}
      isRefreshingCatalog={isRefreshingCatalog}
      onGroupCreated={handleGroupCreated}
      onGroupDeleted={handleGroupDeleted}
      onGroupUpdated={handleGroupUpdated}
      onRefreshCatalog={handleRefreshCatalog}
      onSaveSelection={handleSaveSelection}
      onSelectGroup={setSelectedGroupId}
      onClearUnavailableModelNotices={handleClearUnavailableModelNotices}
      refreshFeedback={refreshFeedback}
      refreshFeedbackKind={refreshFeedbackKind}
      selectedModels={selectedModels}
      selectedGroup={selectedGroup}
      unavailableModelNotices={unavailableModelNotices}
    />
  );
}
