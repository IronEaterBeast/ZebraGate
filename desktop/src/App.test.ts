import { describe, expect, it, vi } from "vitest";
import { buildViewedGroupIdStorageKey, loadDesktopViewState } from "./App";
import type { DesktopRuntimeSnapshot } from "./lib/api-client";

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
    credits: null,
    remoteApiErrorMessage: null,
    groups: [
      {
        id: "group-default",
        name: "default",
        localKey: "zg-local-test",
        lastUsedAt: null,
        isDefault: true,
        selectedAiOptionCount: 1
      }
    ]
  };
}

describe("loadDesktopViewState", () => {
  it("returns runtime data from the runtime snapshot", async () => {
    const runtimeSnapshot = createRuntimeSnapshot();

    const result = await loadDesktopViewState({
      getDesktopRuntimeSnapshot: vi.fn().mockResolvedValue(runtimeSnapshot)
    });

    expect(result.runtimeSnapshot).toEqual(runtimeSnapshot);
    expect(result.error).toBeNull();
  });

  it("throws when the runtime snapshot cannot be loaded", async () => {
    const getDesktopRuntimeSnapshot = vi
      .fn<typeof import("./lib/api-client").getDesktopRuntimeSnapshot>()
      .mockRejectedValue(new Error("runtime unavailable"));

    await expect(
      loadDesktopViewState({
        getDesktopRuntimeSnapshot
      })
    ).rejects.toThrow("runtime unavailable");
  });

  it("keeps each account's viewed group selection in a separate localStorage key", async () => {
    expect(buildViewedGroupIdStorageKey("user-1")).toBe("zebragate.viewedGroupId.user-1");
    expect(buildViewedGroupIdStorageKey("user-2")).toBe("zebragate.viewedGroupId.user-2");
    expect(buildViewedGroupIdStorageKey("user-1")).not.toBe(buildViewedGroupIdStorageKey("user-2"));
  });
});
