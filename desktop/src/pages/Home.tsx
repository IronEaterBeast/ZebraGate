import { useEffect, useMemo, useRef, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  openStatusReportWindow,
  resizeMainWindowToContent,
  type AuthStatusSnapshot,
  type DesktopGroupSummary,
  type DesktopRuntimeSnapshot
} from "../lib/api-client";
import { formatGroupLastUsedAt } from "../lib/group-usage";

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
  const infoListRef = useRef<HTMLDivElement>(null);
  const statusBarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void onRefresh();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [onRefresh]);

  const currentStatusReport = useMemo(
    () => buildCurrentStatusReport({ error, runtimeSnapshot, selectedAiCount, viewedGroup }),
    [error, runtimeSnapshot, selectedAiCount, viewedGroup]
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
    const confirmed = await confirm("确定要退出登录吗？", { title: "退出登录", kind: "warning" });
    if (confirmed) {
      await onLogout();
    }
  }

  if (!authStatus?.loggedIn) {
    return (
      <div className="signin-prompt">
        <span className="signin-title">ZebraGate</span>
        {error ? <div className="error-banner">{error}</div> : null}
        <button onClick={() => void onLogin()} disabled={isBusy} type="button">
          Sign In
        </button>
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
            <span className="info-label">分组</span>
            <select
              className="info-value"
              disabled={isBusy || groups.length === 0}
              onChange={(event) => onSwitchGroup(event.target.value)}
              value={viewedGroup?.id ?? ""}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}（已选 {group.selectedModelCount}）
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              disabled={isBusy}
              onClick={onOpenGroupManagement}
              title="管理分组"
              type="button"
            >
              管理
            </button>
          </div>

          <div className="info-row">
            <span className="info-label">Base URL</span>
            <span className="info-value">{baseUrl}</span>
            <CopyButton value={baseUrl} />
          </div>
          <div className="info-row">
            <span className="info-label">Key</span>
            <span className="info-value">{viewedGroup?.localKey ?? ""}</span>
            <CopyButton value={viewedGroup?.localKey ?? ""} />
          </div>
          <div className="info-row">
            <span className="info-label">Model</span>
            <span className="info-value">{runtimeSnapshot.model}</span>
            <CopyButton value={runtimeSnapshot.model} />
          </div>
          <div className="info-row">
            <span className="info-label">最后使用</span>
            <span className="info-value">{formatGroupLastUsedAt(viewedGroup?.lastUsedAt ?? null)}</span>
            <span />
          </div>
        </div>
      </div>

      <footer className="status-bar" ref={statusBarRef}>
        <span className="account-name">{authStatus.email ?? "unknown"}</span>
        <button
          className="status-icon-button"
          onClick={() => void handleSignOutClick()}
          disabled={isBusy}
          title="Sign Out"
          type="button"
        >
          ⏻
        </button>
        <span className="status-spacer" />
        {currentStatusReport.items.length > 0 ? (
          <button
            className="status-error-button"
            onClick={() => void openStatusReportWindow(currentStatusReport.items)}
            title="查看当前错误"
            type="button"
          >
            ERROR {currentStatusReport.items.length}
          </button>
        ) : null}
        <span>Credits: {runtimeSnapshot.credits ?? "Unavailable"}</span>
        <span className={selectedAiCount < 1 ? "status-error" : undefined}>已选 AI: {selectedAiCount}</span>
        <button
          className="status-icon-button"
          onClick={onOpenGroupManagement}
          disabled={isBusy}
          title="管理分组"
          type="button"
        >
          ⚙
        </button>
      </footer>
    </div>
  );
}

export function buildCurrentStatusReport({
  error,
  runtimeSnapshot,
  selectedAiCount,
  viewedGroup
}: {
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
    items.push(`无法连接 ZebraGate API：${runtimeSnapshot.remoteApiErrorMessage}`);
  }

  if (!viewedGroup) {
    items.push("当前没有可用分组。");
  } else if (selectedAiCount < 1) {
    items.push("当前分组尚未选择 AI。本地服务可以启动，但客户端使用该分组请求时会被本地拒绝。");
  }

  if (!runtimeSnapshot.proxyStatus.running) {
    const failedToStart = runtimeSnapshot.proxyStatus.lastRequestStatus === "Local proxy failed to start.";
    const stoppedWithError = runtimeSnapshot.proxyStatus.lastRequestStatus === "Local proxy stopped with an error.";
    if (failedToStart || stoppedWithError) {
      items.push(runtimeSnapshot.proxyStatus.lastErrorMessage ?? runtimeSnapshot.proxyStatus.lastRequestStatus);
    }
  }

  return { items: Array.from(new Set(items)) };
}
