import type { FastifyRequest } from "fastify";
import { mockUserProfile, validateBasicAuthHeader } from "@zebragate/shared";
import { getEnv } from "../config/env.js";
import { createSupabaseAuthClient } from "../services/supabase.js";
import { ZebraGateApiError } from "./errors.js";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

function isMockAuthAllowed(): boolean {
  return process.env.ZEBRAGATE_ALLOW_MOCK_AUTH === "true";
}

function resolveMockUser(request: FastifyRequest): AuthenticatedUser {
  const headerValue = request.headers["x-zebragate-user-id"];

  if (typeof headerValue === "string" && headerValue.length > 0) {
    return { id: headerValue, email: null };
  }

  return { id: process.env.ZEBRAGATE_MOCK_USER_ID ?? mockUserProfile.id, email: mockUserProfile.email };
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;

  if (typeof header !== "string") {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function resolveCurrentUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  const token = extractBearerToken(request);

  if (token) {
    const client = createSupabaseAuthClient();
    const { data, error } = await client.auth.getUser(token);

    if (error || !data.user) {
      throw new ZebraGateApiError("UNAUTHORIZED", "Invalid or expired access token.", 401);
    }

    return { id: data.user.id, email: data.user.email ?? null };
  }

  if (isMockAuthAllowed()) {
    return resolveMockUser(request);
  }

  throw new ZebraGateApiError("UNAUTHORIZED", "Authentication is required.", 401);
}

export async function resolveCurrentUserId(request: FastifyRequest): Promise<string> {
  return (await resolveCurrentUser(request)).id;
}

export function assertAdminAuthenticated(request: FastifyRequest): void {
  const env = getEnv();

  if (!env.adminUsername || !env.adminPassword) {
    throw new ZebraGateApiError(
      "FORBIDDEN",
      "ZebraGate admin credentials are not configured.",
      403
    );
  }

  const authorization = request.headers.authorization;
  const validation = validateBasicAuthHeader(authorization, env.adminUsername, env.adminPassword);

  if (!validation.ok && validation.reason === "missing") {
    throw new ZebraGateApiError("UNAUTHORIZED", "Admin authentication is required.", 401);
  }

  if (!validation.ok) {
    throw new ZebraGateApiError("FORBIDDEN", "Invalid admin credentials.", 403);
  }
}
