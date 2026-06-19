import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const envState = {
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "anon-key",
  supabaseServiceRoleKey: "service-role-key"
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock
}));

vi.mock("../config/env.js", () => ({
  getEnv: () => envState
}));

const { createSupabaseAuthClient, getSupabaseAdminClient, refreshSupabaseSession } = await import("./supabase.js");

describe("supabase service clients", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("memoizes the service-role database client", () => {
    const adminClient = { auth: {} };
    createClientMock.mockReturnValue(adminClient);

    const first = getSupabaseAdminClient();
    const second = getSupabaseAdminClient();

    expect(first).toBe(adminClient);
    expect(second).toBe(adminClient);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(envState.supabaseUrl, envState.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  });

  it("creates a fresh anon auth client for each auth flow", () => {
    const firstClient = { auth: {} };
    const secondClient = { auth: {} };
    createClientMock.mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient);

    const first = createSupabaseAuthClient();
    const second = createSupabaseAuthClient();

    expect(first).toBe(firstClient);
    expect(second).toBe(secondClient);
    expect(createClientMock).toHaveBeenNthCalledWith(1, envState.supabaseUrl, envState.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    expect(createClientMock).toHaveBeenNthCalledWith(2, envState.supabaseUrl, envState.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  });

  it("refreshes sessions with an isolated anon client", async () => {
    const refreshSessionMock = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_at: 1_700_003_600,
          user: {
            id: "user-1",
            email: "user@example.com"
          }
        }
      },
      error: null
    });
    createClientMock.mockReturnValue({
      auth: {
        refreshSession: refreshSessionMock
      }
    });

    const session = await refreshSupabaseSession("refresh-token");

    expect(createClientMock).toHaveBeenCalledWith(envState.supabaseUrl, envState.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    expect(refreshSessionMock).toHaveBeenCalledWith({ refresh_token: "refresh-token" });
    expect(session).toEqual({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: 1_700_003_600,
      email: "user@example.com",
      userId: "user-1"
    });
  });
});
