import type { FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

vi.mock("../services/supabase.js", () => ({
  createSupabaseAuthClient: () => ({
    auth: { getUser: getUserMock }
  })
}));

const { resolveCurrentUser } = await import("./auth.js");

function buildRequest(headers: Record<string, string>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

describe("resolveCurrentUser", () => {
  afterEach(() => {
    getUserMock.mockReset();
    delete process.env.ZEBRAGATE_ALLOW_MOCK_AUTH;
    delete process.env.ZEBRAGATE_MOCK_USER_ID;
  });

  it("returns the Supabase user when a valid bearer token is provided", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-123", email: "user@example.com" } },
      error: null
    });

    const result = await resolveCurrentUser(buildRequest({ authorization: "Bearer valid-token" }));

    expect(result).toEqual({ id: "user-123", email: "user@example.com" });
    expect(getUserMock).toHaveBeenCalledWith("valid-token");
  });

  it("throws UNAUTHORIZED when the bearer token is invalid", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error("invalid token") });

    await expect(
      resolveCurrentUser(buildRequest({ authorization: "Bearer bad-token" }))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when no token is present and mock auth is disabled", async () => {
    await expect(resolveCurrentUser(buildRequest({}))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("falls back to the x-zebragate-user-id header when mock auth is enabled", async () => {
    process.env.ZEBRAGATE_ALLOW_MOCK_AUTH = "true";

    const result = await resolveCurrentUser(buildRequest({ "x-zebragate-user-id": "dev-user-1" }));

    expect(result).toEqual({ id: "dev-user-1", email: null });
    expect(getUserMock).not.toHaveBeenCalled();
  });
});
