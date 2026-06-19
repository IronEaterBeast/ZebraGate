import type { AiOptionPublicCatalogRow } from "@zebragate/db";
import { PROVIDER_STATUS_VALUES, type ProviderStatus, type PublicAiOption } from "@zebragate/shared";
import { getSupabaseAdminClient } from "./supabase.js";
import { ZebraGateApiError } from "../utils/errors.js";

export interface ListPublicAiOptionsInput {
  recommendedOnly: boolean;
}

export interface PublicAiOptionRepository {
  listPublicAiOptions(input: ListPublicAiOptionsInput): Promise<PublicAiOption[]>;
}

export async function listPublicAiOptions(
  input: ListPublicAiOptionsInput,
  repository: PublicAiOptionRepository = createSupabasePublicAiOptionRepository()
): Promise<PublicAiOption[]> {
  return repository.listPublicAiOptions(input);
}

export function createSupabasePublicAiOptionRepository(): PublicAiOptionRepository {
  return {
    async listPublicAiOptions(input: ListPublicAiOptionsInput): Promise<PublicAiOption[]> {
      const client = getSupabaseAdminClient();
      let query = client
        .from("ai_option_public_catalog")
        .select("*")
        .eq("is_public", true)
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true })
        .order("ai_option_id", { ascending: true });

      if (input.recommendedOnly) {
        query = query.eq("is_recommended", true);
      }

      const { data, error } = await query;

      if (error) {
        throw new ZebraGateApiError(
          "PROVIDER_UNAVAILABLE",
          `Failed to load AI options from Supabase: ${error.message}`,
          503
        );
      }

      return ((data ?? []) as AiOptionPublicCatalogRow[]).map(fromAiOptionPublicCatalogRow);
    }
  };
}

export function fromAiOptionPublicCatalogRow(row: AiOptionPublicCatalogRow): PublicAiOption {
  return {
    aiOptionId: row.ai_option_id,
    providerLabel: row.provider_label,
    modelLabel: row.model_label,
    publicName: row.public_name,
    displayConfigSummary: row.display_config_summary,
    displayBadges: Array.isArray(row.display_badges) ? row.display_badges : [],
    creditMultiplier: row.credit_multiplier,
    isRecommended: row.is_recommended,
    status: normalizePublicAiOptionStatus(row.status),
    disableReason: row.disable_reason,
    sortOrder: row.sort_order
  };
}

function normalizePublicAiOptionStatus(value: unknown): ProviderStatus {
  const status = typeof value === "string" ? value.trim() : "";
  return PROVIDER_STATUS_VALUES.includes(status as ProviderStatus) ? (status as ProviderStatus) : "unknown";
}
