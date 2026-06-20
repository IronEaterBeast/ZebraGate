import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCurrentStatusReport, HomePage } from "./Home";
import type { DesktopGroupSummary, DesktopRuntimeSnapshot } from "../lib/api-client";

function createRuntimeSnapshot(): DesktopRuntimeSnapshot {
  return {
    proxyStatus: {
      running: false,
      port: 7788,
      address: "http://127.0.0.1:7788",
      lastRequestStatus: "Local proxy is idle.",
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
    expect(html).toContain("Sign In");
    expect(html).not.toContain("Sign Out");
    expect(html).not.toContain("Base URL");
    expect(html).not.toContain("管理分组");
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
    expect(html).toContain("Base URL");
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
        error: null,
        runtimeSnapshot,
        selectedAiCount: 2,
        viewedGroup: runtimeSnapshot.groups[1]
      }).items
    ).toEqual([]);

    expect(
      buildCurrentStatusReport({
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
    runtimeSnapshot.proxyStatus.lastRequestStatus = "Local proxy failed to start.";
    runtimeSnapshot.proxyStatus.lastErrorMessage = "Port is already in use.";
    runtimeSnapshot.groups[0].selectedModelCount = 1;

    expect(
      buildCurrentStatusReport({
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
    runtimeSnapshot.proxyStatus.lastRequestStatus = "Local proxy is idle.";
    runtimeSnapshot.proxyStatus.lastErrorMessage = null;
    runtimeSnapshot.groups[0].selectedModelCount = 1;

    expect(
      buildCurrentStatusReport({
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

    expect(html).toContain("ERROR 1");
    expect(html).toContain("status-error-button");
    expect(html).not.toContain("error-banner-stack");
    expect(html).not.toContain("无法连接 ZebraGate API");
  });

  it("shows the current issue count in the status bar error button", () => {
    const runtimeSnapshot = createRuntimeSnapshot();
    runtimeSnapshot.proxyStatus.running = false;
    runtimeSnapshot.proxyStatus.lastRequestStatus = "Local proxy failed to start.";
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

    expect(html).toContain("ERROR 2");
  });
});
