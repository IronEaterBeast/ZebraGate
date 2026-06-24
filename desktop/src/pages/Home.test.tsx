import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import { buildCurrentStatusReport, HomePage } from "./Home";
import type { DesktopGroupSummary, DesktopRuntimeSnapshot } from "../lib/api-client";

const t = i18n.getFixedT(null, null);

function createRuntimeSnapshot(): DesktopRuntimeSnapshot {
  return {
    proxyStatus: {
      running: false,
      port: 7788,
      address: "http://127.0.0.1:7788",
      lastRequestStatus: "IDLE",
      lastErrorMessage: null
    },
    deviceId: "device-1",
    model: "zebragate_model",
    credits: 500,
    remoteApiErrorMessage: null,
    groups: [
      {
        id: "group-default",
        name: "default",
        localKey: "zg-local-test",
        lastUsedAt: null,
        isDefault: true,
        selectedModelCount: 0
      }
    ]
  };
}

function createViewedGroup(runtimeSnapshot: DesktopRuntimeSnapshot): DesktopGroupSummary {
  return runtimeSnapshot.groups[0];
}

describe("HomePage", () => {
  it("only shows a centered sign-in button when the user is not signed in", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    const html = renderToStaticMarkup(
      <HomePage
        authStatus={{ loggedIn: false, email: null, userId: null }}
        error={null}
        isBusy={false}
        onLogin={async () => undefined}
        onLogout={async () => undefined}
        onOpenGroupManagement={() => undefined}
        onRefresh={async () => undefined}
        onSwitchGroup={() => undefined}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={0}
        viewedGroup={createViewedGroup(runtimeSnapshot)}
      />
    );

    expect(html).toContain("signin-prompt");
    expect(html).toContain("登录");
    expect(html).not.toContain("退出登录");
    expect(html).not.toContain("服务地址");
    expect(html).not.toContain("管理分组");
  });

  it("formats the app version label shown on the sign-in screen", () => {
    // 版本号在登录页通过 getVersion() 异步注入，渲染不到字符串本身，
    // 这里直接锁定面向用户的 i18n 文案格式，避免后续改键名/格式时悄悄破坏。
    expect(t("home.version", { version: "1.0.0" })).toBe("版本 1.0.0");
  });

  it("exposes a check-for-updates entry on both the sign-in and signed-in screens", () => {
    const runtimeSnapshot = createRuntimeSnapshot();

    const signedOutHtml = renderToStaticMarkup(
      <HomePage
        authStatus={{ loggedIn: false, email: null, userId: null }}
        error={null}
        isBusy={false}
        onLogin={async () => undefined}
        onLogout={async () => undefined}
        onOpenGroupManagement={() => undefined}
        onRefresh={async () => undefined}
        onSwitchGroup={() => undefined}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={0}
        viewedGroup={createViewedGroup(runtimeSnapshot)}
      />
    );
    expect(signedOutHtml).toContain("signin-update-button");
    expect(signedOutHtml).toContain(t("home.checkForUpdates"));

    const signedInHtml = renderToStaticMarkup(
      <HomePage
        authStatus={{ loggedIn: true, email: "user@example.com", userId: "user-1" }}
        error={null}
        isBusy={false}
        onLogin={async () => undefined}
        onLogout={async () => undefined}
        onOpenGroupManagement={() => undefined}
        onRefresh={async () => undefined}
        onSwitchGroup={() => undefined}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={0}
        viewedGroup={createViewedGroup(runtimeSnapshot)}
      />
    );
    expect(signedInHtml).toContain("status-update-button");
    expect(signedInHtml).toContain(t("home.checkForUpdates"));
  });

  it("keeps the check-for-updates user-facing strings localized", () => {
    expect(t("home.checkForUpdates")).toBe("检查更新");
    expect(t("home.upToDate")).toBe("已是最新版本");
    expect(t("home.updateCheckFailed")).toBe("检查更新失败");
  });

  it("shows an explicit no-email label for signed-in accounts without email", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    const html = renderToStaticMarkup(
      <HomePage
        authStatus={{ loggedIn: true, email: null, userId: "user-1" }}
        error={null}
        isBusy={false}
        onLogin={async () => undefined}
        onLogout={async () => undefined}
        onOpenGroupManagement={() => undefined}
        onRefresh={async () => undefined}
        onSwitchGroup={() => undefined}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={0}
        viewedGroup={createViewedGroup(runtimeSnapshot)}
      />
    );

    expect(html).toContain("无邮箱");
    expect(html).toContain("account-name-button");
    expect(html).toContain("打开 Dashboard");
    expect(html).not.toContain("未知");
  });

  it("does not render developer-only config fields for normal users", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    const html = renderToStaticMarkup(
      <HomePage
        authStatus={{ loggedIn: true, email: "user@example.com", userId: "user-1" }}
        error={null}
        isBusy={false}
        onLogin={async () => undefined}
        onLogout={async () => undefined}
        onOpenGroupManagement={() => undefined}
        onRefresh={async () => undefined}
        onSwitchGroup={() => undefined}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={0}
        viewedGroup={createViewedGroup(runtimeSnapshot)}
      />
    );

    expect(html).not.toContain("Remote API Base URL");
    expect(html).not.toContain("Dev User UUID");
    expect(html).not.toContain("Save Developer Config");
    expect(html).not.toContain("Device ID");
    expect(html).not.toContain("Daily Check-in");
    expect(html).toContain("服务地址");
    expect(html).toContain("http://127.0.0.1:7788/v1");
    expect(html).toContain("最后使用");
    expect(html).toContain("从未使用");
  });

  it("builds current status from the viewed group instead of stale proxy errors", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    runtimeSnapshot.proxyStatus.running = true;
    runtimeSnapshot.proxyStatus.lastErrorMessage =
      "No AI option is selected in ZebraGate Desktop. Please select at least one AI option and try again.";
    runtimeSnapshot.groups = [
      {
        id: "group-empty",
        name: "empty",
        localKey: "zg-local-empty",
        lastUsedAt: null,
        isDefault: false,
        selectedModelCount: 0
      },
      {
        id: "group-ready",
        name: "ready",
        localKey: "zg-local-ready",
        lastUsedAt: null,
        isDefault: true,
        selectedModelCount: 2
      }
    ];

    expect(
      buildCurrentStatusReport({
        t,
        error: null,
        runtimeSnapshot,
        selectedAiCount: 2,
        viewedGroup: runtimeSnapshot.groups[1]
      }).items
    ).toEqual([]);

    expect(
      buildCurrentStatusReport({
        t,
        error: null,
        runtimeSnapshot,
        selectedAiCount: 0,
        viewedGroup: runtimeSnapshot.groups[0]
      }).items
    ).toEqual([
      "当前分组尚未选择 AI。本地服务可以启动，但客户端使用该分组请求时会被本地拒绝。"
    ]);
  });

  it("reports current proxy startup failures", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    runtimeSnapshot.proxyStatus.running = false;
    runtimeSnapshot.proxyStatus.lastRequestStatus = "FAILED_TO_START";
    runtimeSnapshot.proxyStatus.lastErrorMessage = "Port is already in use.";
    runtimeSnapshot.groups[0].selectedModelCount = 1;

    expect(
      buildCurrentStatusReport({
        t,
        error: null,
        runtimeSnapshot,
        selectedAiCount: 1,
        viewedGroup: runtimeSnapshot.groups[0]
      }).items
    ).toEqual(["Port is already in use."]);
  });

  it("does not report idle proxy state as a current issue", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    runtimeSnapshot.proxyStatus.running = false;
    runtimeSnapshot.proxyStatus.lastRequestStatus = "IDLE";
    runtimeSnapshot.proxyStatus.lastErrorMessage = null;
    runtimeSnapshot.groups[0].selectedModelCount = 1;

    expect(
      buildCurrentStatusReport({
        t,
        error: null,
        runtimeSnapshot,
        selectedAiCount: 1,
        viewedGroup: runtimeSnapshot.groups[0]
      }).items
    ).toEqual([]);
  });

  it("reports remote API connectivity failures", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    runtimeSnapshot.proxyStatus.running = true;
    runtimeSnapshot.credits = null;
    runtimeSnapshot.remoteApiErrorMessage =
      "Failed to fetch credits balance from ZebraGate API: connection refused";
    runtimeSnapshot.groups[0].selectedModelCount = 1;

    expect(
      buildCurrentStatusReport({
        t,
        error: null,
        runtimeSnapshot,
        selectedAiCount: 1,
        viewedGroup: runtimeSnapshot.groups[0]
      }).items
    ).toEqual([
      "无法连接 ZebraGate API：Failed to fetch credits balance from ZebraGate API: connection refused"
    ]);
  });

  it("renders current issues in the status bar without showing floating banners", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    runtimeSnapshot.proxyStatus.running = true;
    runtimeSnapshot.groups[0].selectedModelCount = 1;
    runtimeSnapshot.remoteApiErrorMessage = "connection refused";
    const html = renderToStaticMarkup(
      <HomePage
        authStatus={{ loggedIn: true, email: "user@example.com", userId: "user-1" }}
        error={null}
        isBusy={false}
        onLogin={async () => undefined}
        onLogout={async () => undefined}
        onOpenGroupManagement={() => undefined}
        onRefresh={async () => undefined}
        onSwitchGroup={() => undefined}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={1}
        viewedGroup={createViewedGroup(runtimeSnapshot)}
      />
    );

    expect(html).toContain("错误 1");
    expect(html).toContain("status-error-button");
    expect(html).not.toContain("error-banner-stack");
    expect(html).not.toContain("无法连接 ZebraGate API");
  });

  it("shows the current issue count in the status bar error button", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    runtimeSnapshot.proxyStatus.running = false;
    runtimeSnapshot.proxyStatus.lastRequestStatus = "FAILED_TO_START";
    runtimeSnapshot.proxyStatus.lastErrorMessage = "Port is already in use.";
    runtimeSnapshot.remoteApiErrorMessage = "connection refused";
    runtimeSnapshot.groups[0].selectedModelCount = 1;
    const html = renderToStaticMarkup(
      <HomePage
        authStatus={{ loggedIn: true, email: "user@example.com", userId: "user-1" }}
        error={null}
        isBusy={false}
        onLogin={async () => undefined}
        onLogout={async () => undefined}
        onOpenGroupManagement={() => undefined}
        onRefresh={async () => undefined}
        onSwitchGroup={() => undefined}
        runtimeSnapshot={runtimeSnapshot}
        selectedAiCount={1}
        viewedGroup={createViewedGroup(runtimeSnapshot)}
      />
    );

    expect(html).toContain("错误 2");
  });
});
