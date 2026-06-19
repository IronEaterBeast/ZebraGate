import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZebraGateApiError } from "../../utils/errors.js";

const refreshSupabaseSessionMock = vi.fn();

vi.mock("../../services/supabase.js", () => ({
  refreshSupabaseSession: refreshSupabaseSessionMock
}));

vi.mock("../../services/profiles.js", () => ({
  getProfileForCurrentUser: vi.fn()
}));

vi.mock("../../utils/auth.js", () => ({
  resolveCurrentUser: vi.fn()
}));

const { authRoutes } = await import("./auth.js");

function buildTestApp() {
  const app = Fastify();
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = (body as string).trim();
    if (text.length === 0) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(text));
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZebraGateApiError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }

    reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
  });
  return app;
}

describe("auth routes", () => {
  afterEach(() => {
    refreshSupabaseSessionMock.mockReset();
  });

  it("refreshes the session using the supplied refresh token", async () => {
    refreshSupabaseSessionMock.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: 1_700_003_600,
      email: "user@example.com"
    });

    const app = buildTestApp();
    await app.register(authRoutes, { prefix: "/v1" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ refreshToken: "old-refresh-token" })
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: 1_700_003_600,
      email: "user@example.com"
    });
    expect(refreshSupabaseSessionMock).toHaveBeenCalledWith("old-refresh-token");
  });

  it("rejects refresh requests that are missing a refresh token", async () => {
    const app = buildTestApp();
    await app.register(authRoutes, { prefix: "/v1" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({})
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("BAD_REQUEST");
    expect(refreshSupabaseSessionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the refresh token is invalid or expired", async () => {
    refreshSupabaseSessionMock.mockRejectedValue(
      new ZebraGateApiError("UNAUTHORIZED", "Invalid or expired refresh token.", 401)
    );

    const app = buildTestApp();
    await app.register(authRoutes, { prefix: "/v1" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ refreshToken: "stale-refresh-token" })
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });
});
