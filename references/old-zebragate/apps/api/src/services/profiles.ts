import type { ProfileRow } from "@zebragate/db";
import type { UserProfile } from "@zebragate/shared";
import { ZebraGateApiError } from "../utils/errors.js";
import { getSupabaseAdminClient } from "./supabase.js";

export async function ensureProfile(userId: string, email: string | null): Promise<ProfileRow> {
  const client = getSupabaseAdminClient();

  const { data: existing, error: selectError } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    throw new ZebraGateApiError("INTERNAL_ERROR", selectError.message, 500);
  }

  if (existing) {
    return existing as ProfileRow;
  }

  const { data: created, error: insertError } = await client
    .from("profiles")
    .insert({ id: userId, email })
    .select("*")
    .single();

  if (insertError) {
    throw new ZebraGateApiError("INTERNAL_ERROR", insertError.message, 500);
  }

  return created as ProfileRow;
}

export async function getProfileForCurrentUser(userId: string, email: string | null): Promise<UserProfile> {
  const profile = await ensureProfile(userId, email);

  return {
    id: profile.id,
    email: profile.email ?? "",
    displayName: profile.display_name ?? "",
    avatarUrl: profile.avatar_url,
    createdAt: profile.created_at
  };
}
