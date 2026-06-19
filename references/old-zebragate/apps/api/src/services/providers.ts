import type { AiProviderRow } from "@zebragate/db";
import type { AiProviderPublicInfo } from "@zebragate/shared";
import { getSupabaseAdminClient } from "./supabase.js";
import { ZebraGateApiError } from "../utils/errors.js";

export interface InternalAiProvider extends AiProviderPublicInfo {
  baseUrl: string;
  apiKey: string;
}

export interface ProviderRepository {
  listSelectableProviders(): Promise<InternalAiProvider[]>;
}

export interface ResolvedAiOptionExecutionConfig {
  aiOptionId: string;
  legacyRuntimePresetId: string | null;
  modelId: string;
  upstreamModel: string;
  providerId: string;
  creditMultiplier: number;
  requestParameters: Record<string, unknown>;
}

export function createSupabaseProviderRepository(): ProviderRepository {
  return {
    async listSelectableProviders(): Promise<InternalAiProvider[]> {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("ai_providers")
        .select("*")
        .eq("is_enabled", true)
        .neq("status", "disabled")
        .order("created_at", { ascending: true });

      if (error) {
        throw new ZebraGateApiError(
          "PROVIDER_UNAVAILABLE",
          `Failed to load AI providers from Supabase: ${error.message}`,
          503
        );
      }

      return ((data ?? []) as AiProviderRow[]).map(fromAiProviderRow);
    }
  };
}

function fromAiProviderRow(row: AiProviderRow): InternalAiProvider {
  return {
    id: row.id,
    displayName: row.display_name,
    baseUrl: row.base_url,
    // TODO: 接入真正的加解密
    apiKey: row.api_key_encrypted ?? "",
    model: row.model,
    creditMultiplier: row.credit_multiplier,
    status: row.status as InternalAiProvider["status"],
    isEnabled: row.is_enabled
  };
}
