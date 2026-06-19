import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../config/env.js";
import { ZebraGateApiError } from "../utils/errors.js";

let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const env = getEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new ZebraGateApiError("INTERNAL_ERROR", "Supabase service is not configured.", 500);
  }

  supabaseAdminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  return supabaseAdminClient;
}

export function createSupabaseAuthClient(): SupabaseClient {
  const env = getEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new ZebraGateApiError("INTERNAL_ERROR", "Supabase auth client is not configured.", 500);
  }

  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export interface RefreshedSupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  email: string | null;
  userId: string;
}

export async function refreshSupabaseSession(refreshToken: string): Promise<RefreshedSupabaseSession> {
  const client = createSupabaseAuthClient();
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session) {
    throw new ZebraGateApiError("UNAUTHORIZED", "Invalid or expired refresh token.", 401);
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    email: data.session.user.email ?? null,
    userId: data.session.user.id
  };
}
