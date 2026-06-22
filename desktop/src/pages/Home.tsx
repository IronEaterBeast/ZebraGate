import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import {
  checkForUpdates,
  openStatusReportWindow,
  resizeMainWindowToContent,
  type AuthStatusSnapshot,
  type DesktopGroupSummary,
  type DesktopRuntimeSnapshot
} from "../lib/api-client";
import { formatGroupLastUsedAt } from "../lib/group-usage";

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

type UpdateCheckPhase = "idle" | "checking" | "up-to-date" | "failed";

// 「检查更新」按钮：触发后端检查更新流程。发现新版本时由后端弹原生确认框并自动安装/重启；
// 已是最新或失败时在按钮旁短暂回显状态，避免用户以为点击无反应。
function UpdateCheckButton({
  className,
  checkForUpdatesFn = checkForUpdates
}: {
  className?: string;
  checkForUpdatesFn?: typeof checkForUpdates;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<UpdateCheckPhase>("idle");

  async function handleCheck(): Promise<void> {
    if (phase === "checking") {
      return;
    }
    setPhase("checking");
    try {
      const result = await checkForUpdatesFn();
      // 有新版本时后端会接管确认/安装/重启；这里只需在「无更新」时回显已是最新。
      setPhase(result.updateAvailable ? "idle" : "up-to-date");
    } catch {
      setPhase("failed");
    } finally {
      window.setTimeout(() => setPhase("idle"), 2400);
    }
  }

  const label =
    phase === "checking"
      ? t("home.checkingForUpdates")
      : phase === "up-to-date"
        ? t("home.upToDate")
        : phase === "failed"
          ? t("home.updateCheckFailed")
          : t("home.checkForUpdates");

  return (
    <button
      className={className ?? "icon-button"}
      onClick={() => void handleCheck()}
      disabled={phase === "checking"}
      title={t("home.checkForUpdates")}
      type="button"
    >
      {label}
    </button>
  );
}

export function HomePage({
  authStatus,
  error,
  isBusy,
  onLogin,
  onLogout,
  onOpenGroupManagement,
  onRefresh,
  onSwitchGroup,
  runtimeSnapshot,
  selectedAiCount,
  viewedGroup
}: {
  authStatus: AuthStatusSnapshot | null;
  error: string | null;
  isBusy: boolean;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenGroupManagement: () => void;
  onRefresh: () => Promise<void>;
  onSwitchGroup: (groupId: string) => void;
  runtimeSnapshot: DesktopRuntimeSnapshot;
  selectedAiCount: number;
  viewedGroup: DesktopGroupSummary | null;
}) {
  const { t } = useTranslation();
  const infoListRef = useRef<HTMLDivElement>(null);
  const statusBarRef = useRef<HTMLElement>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        // 版本号仅用于展示，拿不到时静默忽略，不影响主流程。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void onRefresh();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [onRefresh]);

  const currentStatusReport = useMemo(
    () => buildCurrentStatusReport({ t, error, runtimeSnapshot, selectedAiCount, viewedGroup }),
    [t, error, runtimeSnapshot, selectedAiCount, viewedGroup]
  );

  useEffect(() => {
    const infoList = infoListRef.current;
    const statusBar = statusBarRef.current;
    if (!infoList || !statusBar) {
      return;
    }

    // `.info-list` is a `flex: 1` container, so its `scrollHeight` is at least
    // its stretched `clientHeight` even when the rows it contains are shorter.
    // Sum the rows' own heights instead to get the content's natural height.
    let infoListHeight = 0;
    for (const child of infoList.children) {
      infoListHeight += (child as HTMLElement).offsetHeight;
    }

    const contentHeight = infoListHeight + statusBar.offsetHeight;
    void resizeMainWindowToContent(contentHeight);
  }, [runtimeSnapshot, currentStatusReport, viewedGroup]);

  async function handleSignOutClick(): Promise<void> {
    const confirmed = await confirm(t("home.signOutConfirmMessage"), {
      title: t("home.signOutConfirmTitle"),
      kind: "warning"
    });
    if (confirmed) {
      await onLogout();
    }
  }

  if (!authStatus?.loggedIn) {
    return (
      <div className="signin-prompt">
        <span className="signin-title">{t("home.appName")}</span>
        {error ? <div className="error-banner">{error}</div> : null}
        <button onClick={() => void onLogin()} disabled={isBusy} type="button">
          {t("home.signIn")}
        </button>
        {appVersion ? (
          <span className="signin-version">{t("home.version", { version: appVersion })}</span>
        ) : null}
        <UpdateCheckButton className="signin-update-button" />
      </div>
    );
  }

  const baseUrl = `${runtimeSnapshot.proxyStatus.address}/v1`;
  const groups = runtimeSnapshot.groups;

  return (
    <div className="app-shell">
      <div className="info-list-wrapper">
        {/*
        {currentStatusReport.items.length > 0 ? (
          <div className="error-banner-stack">
            {currentStatusReport.items.map((message) => (
              <div className="error-banner floating-banner" key={message}>
                <span className="floating-banner-text">{message}</span>
              </div>
            ))}
          </div>
        ) : null}
        */}

        <div className="info-list" ref={infoListRef}>
          <div className="info-row">
            <span className="info-label">{t("home.group")}</span>
            <select
              className="info-value"
              disabled={isBusy || groups.length === 0}
              onChange={(event) => onSwitchGroup(event.target.value)}
              value={viewedGroup?.id ?? ""}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {t("home.groupOption", { name: group.name, count: group.selectedModelCount })}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              disabled={isBusy}
              onClick={onOpenGroupManagement}
              title={t("common.manageGroup")}
              type="button"
            >
              {t("home.manage")}
            </button>
          </div>

          <div className="info-row">
            <span className="info-label">{t("home.baseUrl")}</span>
            <span className="info-value">{baseUrl}</span>
            <CopyButton value={baseUrl} />
          </div>
          <div className="info-row">
            <span className="info-label">{t("home.key")}</span>
            <span className="info-value">{viewedGroup?.localKey ?? ""}</span>
            <CopyButton value={viewedGroup?.localKey ?? ""} />
          </div>
          <div className="info-row">
            <span className="info-label">{t("home.model")}</span>
            <span className="info-value">{runtimeSnapshot.model}</span>
            <CopyButton value={runtimeSnapshot.model} />
          </div>
          <div className="info-row">
            <span className="info-label">{t("home.lastUsed")}</span>
            <span className="info-value">{formatGroupLastUsedAt(t, viewedGroup?.lastUsedAt ?? null)}</span>
            <span />
          </div>
        </div>
      </div>

      <footer className="status-bar" ref={statusBarRef}>
        <span className="account-name">{authStatus.email ?? t("common.unknown")}</span>
        <button
          className="status-icon-button"
          onClick={() => void handleSignOutClick()}
          disabled={isBusy}
          title={t("home.signOut")}
          type="button"
        >
          ⏻
        </button>
        <UpdateCheckButton className="status-update-button" />
        <span className="status-spacer" />
        {currentStatusReport.items.length > 0 ? (
          <button
            className="status-error-button"
            onClick={() => void openStatusReportWindow(currentStatusReport.items)}
            title={t("home.viewCurrentError")}
            type="button"
          >
            {t("home.error", { count: currentStatusReport.items.length })}
          </button>
        ) : null}
        <span>{t("home.credits", { value: runtimeSnapshot.credits ?? t("home.creditsUnavailable") })}</span>
        <span className={selectedAiCount < 1 ? "status-error" : undefined}>
          {t("home.selectedAi", { count: selectedAiCount })}
        </span>
        <button
          className="status-icon-button"
          onClick={onOpenGroupManagement}
          disabled={isBusy}
          title={t("common.manageGroup")}
          type="button"
        >
          ⚙
        </button>
      </footer>
    </div>
  );
}

export function buildCurrentStatusReport({
  t,
  error,
  runtimeSnapshot,
  selectedAiCount,
  viewedGroup
}: {
  t: TFunction;
  error: string | null;
  runtimeSnapshot: DesktopRuntimeSnapshot;
  selectedAiCount: number;
  viewedGroup: DesktopGroupSummary | null;
}): { items: string[] } {
  const items: string[] = [];

  if (error) {
    items.push(error);
  }

  if (runtimeSnapshot.remoteApiErrorMessage) {
    items.push(t("home.statusRemoteApiError", { message: runtimeSnapshot.remoteApiErrorMessage }));
  }

  if (!viewedGroup) {
    items.push(t("home.statusNoGroup"));
  } else if (selectedAiCount < 1) {
    items.push(t("home.statusNoAiSelected"));
  }

  if (!runtimeSnapshot.proxyStatus.running) {
    const status = runtimeSnapshot.proxyStatus.lastRequestStatus;
    const failedToStart = status === "FAILED_TO_START";
    const stoppedWithError = status === "STOPPED_WITH_ERROR";
    if (failedToStart || stoppedWithError) {
      items.push(
        runtimeSnapshot.proxyStatus.lastErrorMessage ?? t(`proxyStatus.${status}`)
      );
    }
  }

  return { items: Array.from(new Set(items)) };
}
