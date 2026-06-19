import { useEffect, useState } from "react";
import {
  clearUnavailableAiOptionNotices,
  getAiOptionCatalog,
  getAiOptionSelection,
  getDesktopRuntimeSnapshot,
  refreshAiOptionCatalog,
  saveAiOptionSelection,
  type DesktopGroupSummary,
  type PublicAiOption,
  type UnavailableAiOptionNotice
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
  const [groups, setGroups] = useState<DesktopGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    parseGroupIdFromHash(window.location.hash)
  );
  const [aiOptions, setAiOptions] = useState<PublicAiOption[]>([]);
  const [selectedAiOptionIds, setSelectedAiOptionIds] = useState<string[]>([]);
  const [catalogFetchedAt, setCatalogFetchedAt] = useState<number | null>(null);
  const [isCatalogStale, setIsCatalogStale] = useState(false);
  const [unavailableAiOptionNotices, setUnavailableAiOptionNotices] = useState<UnavailableAiOptionNotice[]>([]);
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
    void loadAiOptionCatalogState();
    const interval = window.setInterval(() => {
      void loadGroups();
      void loadAiOptionCatalogState();
    }, GROUP_MANAGEMENT_STATE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void loadAiSelectionState();
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

  function applyAiOptionCatalog(catalog: Awaited<ReturnType<typeof getAiOptionCatalog>>): void {
    setAiOptions(catalog.aiOptions);
    setCatalogFetchedAt(catalog.fetchedAt);
    setIsCatalogStale(catalog.isStale);
    setUnavailableAiOptionNotices(catalog.unavailableAiOptionNotices);
  }

  async function loadAiOptionCatalogState(): Promise<void> {
    try {
      applyAiOptionCatalog(await getAiOptionCatalog());
    } catch (loadError) {
      setCatalogError(
        loadError instanceof Error ? loadError.message : "Failed to fetch AI option catalog from ZebraGate API."
      );
    }
  }

  async function loadAiSelectionState(): Promise<void> {
    if (!selectedGroupId) {
      setAiOptions([]);
      setSelectedAiOptionIds([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [catalog, selection] = await Promise.all([
        getAiOptionCatalog(),
        getAiOptionSelection(selectedGroupId)
      ]);
      applyAiOptionCatalog(catalog);
      setSelectedAiOptionIds(selection.aiOptionIds);
      setCatalogError(null);
      void refreshAiCatalogSilently();
    } catch (loadError) {
      setCatalogError(
        loadError instanceof Error ? loadError.message : "Failed to fetch AI option catalog from ZebraGate API."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshAiCatalogSilently(): Promise<void> {
    try {
      const catalog = await refreshAiOptionCatalog();
      applyAiOptionCatalog(catalog);
      if (selectedGroupId) {
        const selection = await getAiOptionSelection(selectedGroupId);
        setSelectedAiOptionIds(selection.aiOptionIds);
      }
      await loadGroups();
    } catch {
      // Automatic refresh failures stay silent; stale age is the only persistent warning.
    }
  }

  async function handleRefreshCatalog(): Promise<void> {
    try {
      setIsRefreshingCatalog(true);
      setRefreshFeedback(null);
      const catalog = await refreshAiOptionCatalog();
      applyAiOptionCatalog(catalog);
      if (selectedGroupId) {
        const selection = await getAiOptionSelection(selectedGroupId);
        setSelectedAiOptionIds(selection.aiOptionIds);
      }
      await loadGroups();
      setRefreshFeedbackKind("success");
      setRefreshFeedback("刷新成功");
    } catch {
      setRefreshFeedbackKind("error");
      setRefreshFeedback("刷新失败，请稍后重试");
    } finally {
      setIsRefreshingCatalog(false);
    }
  }

  async function handleSaveSelection(nextSelectedAiOptionIds: string[]): Promise<void> {
    if (!selectedGroupId) {
      return;
    }
    const selection = await saveAiOptionSelection(selectedGroupId, nextSelectedAiOptionIds);
    setSelectedAiOptionIds(selection.aiOptionIds);
    setGroups((current) =>
      current.map((group) =>
        group.id === selectedGroupId ? { ...group, selectedAiOptionCount: selection.aiOptionIds.length } : group
      )
    );
  }

  async function handleClearUnavailableAiOptionNotices(): Promise<void> {
    await clearUnavailableAiOptionNotices();
    setUnavailableAiOptionNotices([]);
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
      aiOptions={aiOptions}
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
      onClearUnavailableAiOptionNotices={handleClearUnavailableAiOptionNotices}
      refreshFeedback={refreshFeedback}
      refreshFeedbackKind={refreshFeedbackKind}
      selectedAiOptionIds={selectedAiOptionIds}
      selectedGroup={selectedGroup}
      unavailableAiOptionNotices={unavailableAiOptionNotices}
    />
  );
}
