import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { validateBasicAuthHeader } from "@zebragate/shared";
import {
  parseAdminAiOptionFormSubmission,
  parseCreateAdminAiOptionFormSubmission
} from "./admin-ai-config-form";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

vi.mock("next/headers", () => ({
  headers: vi.fn()
}));

const originalAdminUsername = process.env.ZEBRAGATE_ADMIN_USERNAME;
const originalAdminPassword = process.env.ZEBRAGATE_ADMIN_PASSWORD;

describe("admin web auth", () => {
  beforeEach(() => {
    process.env.ZEBRAGATE_ADMIN_USERNAME = "admin";
    process.env.ZEBRAGATE_ADMIN_PASSWORD = "secret";
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    restoreEnv("ZEBRAGATE_ADMIN_USERNAME", originalAdminUsername);
    restoreEnv("ZEBRAGATE_ADMIN_PASSWORD", originalAdminPassword);
  });

  it("validates basic auth headers with shared helper", () => {
    expect(validateBasicAuthHeader(undefined, "admin", "secret")).toEqual({
      ok: false,
      reason: "missing"
    });
    expect(validateBasicAuthHeader(encodeBasicAuth("admin", "wrong"), "admin", "secret")).toEqual({
      ok: false,
      reason: "invalid"
    });
    expect(validateBasicAuthHeader(encodeBasicAuth("admin", "secret"), "admin", "secret")).toEqual({
      ok: true
    });
  });

  it("validates basic auth without requiring Node Buffer in the shared helper", () => {
    const originalBuffer = globalThis.Buffer;

    // Exercise the proxy-compatible branch that uses atob/TextDecoder instead of Buffer.
    // @ts-expect-error test override
    globalThis.Buffer = undefined;

    try {
      expect(validateBasicAuthHeader(encodeBasicAuth("admin", "secret"), "admin", "secret")).toEqual({
        ok: true
      });
    } finally {
      globalThis.Buffer = originalBuffer;
    }
  });

  it("treats invalid base64 and missing colon as invalid auth", () => {
    expect(validateBasicAuthHeader("Basic ###not-base64###", "admin", "secret")).toEqual({
      ok: false,
      reason: "invalid"
    });
    expect(validateBasicAuthHeader(`Basic ${encodeBase64("admin-only")}`, "admin", "secret")).toEqual({
      ok: false,
      reason: "invalid"
    });
  });

  it("returns 401 for missing auth and 403 for invalid auth in the web helper", async () => {
    const { verifyAdminAuthorizationHeader } = await import("./admin-auth-core");
    expect(verifyAdminAuthorizationHeader(undefined)).toEqual({ ok: false, status: 401 });
    expect(verifyAdminAuthorizationHeader(encodeBasicAuth("admin", "wrong"))).toEqual({ ok: false, status: 403 });
    expect(verifyAdminAuthorizationHeader(encodeBasicAuth("admin", "secret"))).toEqual({ ok: true, status: 200 });
  });

  it("blocks /admin/ai-config in proxy without credentials", async () => {
    const { proxy } = await import("../proxy");
    const response = proxy(new NextRequest("http://localhost:3000/admin/ai-config"));

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("re-prompts /admin/ai-config in proxy with invalid credentials", async () => {
    const { proxy } = await import("../proxy");
    const response = proxy(
      new NextRequest("http://localhost:3000/admin/ai-config", {
        headers: {
          authorization: encodeBasicAuth("admin", "wrong")
        }
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("allows /admin/ai-config in proxy with valid credentials", async () => {
    const { proxy } = await import("../proxy");
    const response = proxy(
      new NextRequest("http://localhost:3000/admin/ai-config", {
        headers: {
          authorization: encodeBasicAuth("admin", "secret")
        }
      })
    );

    expect(response.status).toBe(200);
  });

  it("keeps proxy auth on a path that does not import next/headers", async () => {
    const proxySource = await readFile(resolve(process.cwd(), "proxy.ts"), "utf8");
    const authCoreSource = await readFile(resolve(process.cwd(), "lib/admin-auth-core.ts"), "utf8");

    expect(proxySource).not.toContain("next/headers");
    expect(proxySource).toContain("./lib/admin-auth-core");
    expect(authCoreSource).not.toContain("next/headers");
  });

  it("rejects server actions when admin authentication is missing or invalid", async () => {
    const { headers } = await import("next/headers");
    const { assertAdminServerActionAuthenticated } = await import("./admin-auth-server");
    vi.mocked(headers).mockResolvedValueOnce(new Headers());

    await expect(assertAdminServerActionAuthenticated()).rejects.toThrow("Admin authentication is required.");

    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({
        authorization: encodeBasicAuth("admin", "wrong")
      })
    );

    await expect(assertAdminServerActionAuthenticated()).rejects.toThrow("Invalid admin credentials.");
  });

  it("allows server actions when admin authentication is valid", async () => {
    const { headers } = await import("next/headers");
    const { assertAdminServerActionAuthenticated } = await import("./admin-auth-server");
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({
        authorization: encodeBasicAuth("admin", "secret")
      })
    );

    await expect(assertAdminServerActionAuthenticated()).resolves.toBeUndefined();
  });
});

describe("admin ai option form parsing", () => {
  it("parses create AI option form submissions with explicit flags", () => {
    const formData = new FormData();
    formData.set("modelId", "model-2");
    formData.set("publicName", "Manual Option");
    formData.set("actualRequestParametersJson", "{\"model\":\"gpt-5\",\"thinking\":true}");
    formData.set("displayConfigSummary", "Ignored summary");
    formData.set("creditMultiplier", "");
    formData.set("status", "unknown");
    formData.set("healthStatus", "unknown");
    formData.set("isPublic", "on");
    formData.set("isEnabled", "on");

    const submission = parseCreateAdminAiOptionFormSubmission(formData);

    expect(submission.input).toEqual({
      modelId: "model-2",
      publicName: "Manual Option",
      actualRequestParametersJson: {
        model: "gpt-5",
        thinking: true
      },
      displayConfigSummaryOverridden: false,
      creditMultiplierOverridden: false,
      status: "unknown",
      healthStatus: "unknown",
      isRecommended: false,
      isPublic: true,
      isEnabled: true
    });
  });

  it("parses create AI option overrides only when explicitly checked", () => {
    const formData = new FormData();
    formData.set("modelId", "model-2");
    formData.set("publicName", "Manual Option");
    formData.set("actualRequestParametersJson", "{\"model\":\"gpt-5\"}");
    formData.set("displayConfigSummary", "管理员摘要");
    formData.set("displayConfigSummaryOverridden", "on");
    formData.set("creditMultiplier", "2.4");
    formData.set("creditMultiplierOverridden", "on");

    const submission = parseCreateAdminAiOptionFormSubmission(formData);

    expect(submission.input).toMatchObject({
      displayConfigSummary: "管理员摘要",
      displayConfigSummaryOverridden: true,
      creditMultiplier: 2.4,
      creditMultiplierOverridden: true
    });
  });

  it("normalizes unsupported create AI option statuses to unknown", () => {
    const formData = new FormData();
    formData.set("modelId", "model-2");
    formData.set("publicName", "Manual Option");
    formData.set("actualRequestParametersJson", "{\"model\":\"gpt-5\"}");
    formData.set("status", "surprising");
    formData.set("healthStatus", "strange");

    const submission = parseCreateAdminAiOptionFormSubmission(formData);

    expect(submission.input).toMatchObject({
      status: "unknown",
      healthStatus: "unknown"
    });
  });

  it("does not mark summary or credit multiplier as overridden when only toggles change", () => {
    const formData = new FormData();
    formData.set("optionId", "option-1");
    formData.set("publicName", "Name");
    formData.set("displayConfigSummary", "Generated summary");
    formData.set("creditMultiplier", "");
    formData.set("sortOrder", "3");
    formData.set("status", "healthy");
    formData.set("healthStatus", "healthy");
    formData.set("disableReason", "");
    formData.set("isRecommended", "on");

    const submission = parseAdminAiOptionFormSubmission(formData);

    expect(submission.input.displayConfigSummaryOverridden).toBe(false);
    expect(submission.input.creditMultiplierOverridden).toBe(false);
    expect(submission.input.status).toBe("healthy");
    expect(submission.input.healthStatus).toBe("healthy");
    expect(submission.input.disableReason).toBeNull();
    expect(submission.input).not.toHaveProperty("displayConfigSummary");
    expect(submission.input).not.toHaveProperty("creditMultiplier");
  });

  it("normalizes unsupported update AI option statuses to unknown", () => {
    const formData = new FormData();
    formData.set("optionId", "option-1");
    formData.set("publicName", "Name");
    formData.set("status", "surprising");
    formData.set("healthStatus", "strange");

    const submission = parseAdminAiOptionFormSubmission(formData);

    expect(submission.input.status).toBe("unknown");
    expect(submission.input.healthStatus).toBe("unknown");
  });

  it("marks display summary as overridden only when explicitly checked", () => {
    const formData = new FormData();
    formData.set("optionId", "option-1");
    formData.set("publicName", "Name");
    formData.set("displayConfigSummary", "管理员摘要");
    formData.set("displayConfigSummaryOverridden", "on");

    const submission = parseAdminAiOptionFormSubmission(formData);

    expect(submission.input.displayConfigSummaryOverridden).toBe(true);
    expect(submission.input.displayConfigSummary).toBe("管理员摘要");
  });

  it("marks credit multiplier as overridden only when explicitly checked", () => {
    const formData = new FormData();
    formData.set("optionId", "option-1");
    formData.set("publicName", "Name");
    formData.set("creditMultiplier", "2.5");
    formData.set("creditMultiplierOverridden", "on");

    const submission = parseAdminAiOptionFormSubmission(formData);

    expect(submission.input.creditMultiplierOverridden).toBe(true);
    expect(submission.input.creditMultiplier).toBe(2.5);
  });

  it("does not coerce an empty credit multiplier input to zero when override is unchecked", () => {
    const formData = new FormData();
    formData.set("optionId", "option-1");
    formData.set("publicName", "Name");
    formData.set("creditMultiplier", "");

    const submission = parseAdminAiOptionFormSubmission(formData);

    expect(submission.input.creditMultiplierOverridden).toBe(false);
    expect(submission.input).not.toHaveProperty("creditMultiplier");
  });
});

function encodeBasicAuth(username: string, password: string): string {
  return `Basic ${encodeBase64(`${username}:${password}`)}`;
}

function encodeBase64(value: string): string {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }

  return Buffer.from(value).toString("base64");
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
