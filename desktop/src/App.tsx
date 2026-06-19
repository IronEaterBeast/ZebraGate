import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getAuthStatus,
  getDesktopBootstrapSnapshot,
  getDesktopRuntimeSnapshot,
  logout,
  openGroupManagementWindow,
  openLoginUrl,
  type AuthStatusSnapshot,
  type DesktopGroupSummary,
  type DesktopRuntimeSnapshot
} from "./lib/api-client";
import { HomePage } from "./pages/Home";

const VIEWED_GROUP_ID_STORAGE_KEY = "zebragate.viewedGroupId";
const DESKTOP_GROUPS_CHANGED_EVENT = "desktop-groups-changed";

export function buildViewedGroupIdStorageKey(userId: string | null): string {
  return `${VIEWED_GROUP_ID_STORAGE_KEY}.${userId ?? "anonymous"}`;
}

function readStoredViewedGroupId(userId: string | null): string | null {
  try {
    return window.localStorage.getItem(buildViewedGroupIdStorageKey(userId));
  } catch {
    return null;
  }
}

function writeStoredViewedGroupId(userId: string | null, groupId: string | null): void {
  try {
    const storageKey = buildViewedGroupIdStorageKey(userId);
    if (groupId) {
      window.localStorage.setItem(storageKey, groupId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // ignore storage errors
  }
}

type DesktopLoadDependencies = {
  getDesktopRuntimeSnapshot: typeof getDesktopRuntimeSnapshot;
};

type DesktopLoadResult = {
  error: string | null;
  runtimeSnapshot: DesktopRuntimeSnapshot;
};

export async function loadDesktopViewState(
  dependencies: DesktopLoadDependencies = {
    getDesktopRuntimeSnapshot
  }
): Promise<DesktopLoadResult> {
  const runtimeSnapshot = await dependencies.getDesktopRuntimeSnapshot();

  return {
    error: null,
    runtimeSnapshot
  };
}

function resolveViewedGroupId(
  groups: DesktopGroupSummary[],
  currentViewedGroupId: string | null
): string | null {
  if (groups.length === 0) {
    return null;
  }

  if (currentViewedGroupId && groups.some((group) => group.id === currentViewedGroupId)) {
    return currentViewedGroupId;
  }

  return groups[0].id;
}

export default function App() {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<DesktopRuntimeSnapshot | null>(null);
  const [viewedGroupId, setViewedGroupId] = useState<string | null>(() => readStoredViewedGroupId(null));
  const [authStatus, setAuthStatus] = useState<AuthStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    void bootstrapDesktopState();
    void refreshAuthStatus();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isDisposed = false;

    void listen(DESKTOP_GROUPS_CHANGED_EVENT, () => {
      void refreshDesktopState();
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    setViewedGroupId(readStoredViewedGroupId(authStatus?.userId ?? null));
  }, [authStatus?.userId]);

  function applyRuntimeSnapshot(snapshot: DesktopRuntimeSnapshot): void {
    setRuntimeSnapshot(snapshot);
    setViewedGroupId((current) => {
      const resolved = resolveViewedGroupId(snapshot.groups, current);
      writeStoredViewedGroupId(authStatus?.userId ?? null, resolved);
      return resolved;
    });
  }

  async function bootstrapDesktopState(): Promise<void> {
    try {
      const bootstrapSnapshot = await getDesktopBootstrapSnapshot();
      applyRuntimeSnapshot(bootstrapSnapshot);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load desktop runtime.");
      return;
    }

    void refreshDesktopState();
  }

  async function refreshAuthStatus(): Promise<void> {
    try {
      setAuthStatus(await getAuthStatus());
    } catch {
      setAuthStatus({ loggedIn: false, email: null, userId: null });
    }
  }

  async function refreshDesktopState(): Promise<void> {
    try {
      const nextState = await loadDesktopViewState();
      setError(nextState.error);
      applyRuntimeSnapshot(nextState.runtimeSnapshot);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load desktop runtime.");
    }
  }

  async function handleLogin(): Promise<void> {
    try {
      setError(null);
      await openLoginUrl();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Failed to open login page.");
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      setIsBusy(true);
      setError(null);
      setAuthStatus(await logout());
      await refreshDesktopState();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Failed to sign out.");
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshAll(): Promise<void> {
    await Promise.allSettled([refreshDesktopState(), refreshAuthStatus()]);
  }

  async function handleOpenGroupManagement(): Promise<void> {
    if (!viewedGroupId) {
      return;
    }

    try {
      setError(null);
      await openGroupManagementWindow(viewedGroupId);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Failed to open group management window.");
    }
  }

  function handleSwitchGroup(groupId: string): void {
    setViewedGroupId(groupId);
    writeStoredViewedGroupId(authStatus?.userId ?? null, groupId);
  }

  if (!runtimeSnapshot) {
    return <main className="shell loading-shell">Loading...</main>;
  }

  const viewedGroup = runtimeSnapshot.groups.find((group) => group.id === viewedGroupId) ?? null;

  return (
    <main className="shell">
      <HomePage
        authStatus={authStatus}
        error={error}
        isBusy={isBusy}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onOpenGroupManagement={() => void handleOpenGroupManagement()}
        onRefresh={refreshAll}
        onSwitchGroup={handleSwitchGroup}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={viewedGroup?.selectedAiOptionCount ?? 0}
        viewedGroup={viewedGroup}
      />
    </main>
  );
}
