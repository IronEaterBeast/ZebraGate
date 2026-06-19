import type { FastifyPluginAsync } from "fastify";
import { getProfileForCurrentUser } from "../../services/profiles.js";
import { refreshSupabaseSession } from "../../services/supabase.js";
import { resolveCurrentUser } from "../../utils/auth.js";
import { ZebraGateApiError } from "../../utils/errors.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request) => {
    const currentUser = await resolveCurrentUser(request);

    return {
      user: await getProfileForCurrentUser(currentUser.id, currentUser.email)
    };
  });

  app.post("/auth/refresh", async (request) => {
    const body = request.body as { refreshToken?: unknown };
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";

    if (!refreshToken) {
      throw new ZebraGateApiError("BAD_REQUEST", "refreshToken is required.", 400);
    }

    const session = await refreshSupabaseSession(refreshToken);

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      email: session.email,
      userId: session.userId
    };
  });
};
