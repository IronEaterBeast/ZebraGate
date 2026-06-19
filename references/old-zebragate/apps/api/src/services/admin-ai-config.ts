import type {
  AiModelDimensionRow,
  AiModelDimensionValueRow,
  AiModelRow,
  AiOptionRow,
  AiProviderRow,
  AiRuntimeTemplateRow
} from "@zebragate/db";
import {
  PROVIDER_STATUS_VALUES,
  applyTemplateCreditRules,
  applyTemplateRequestDefaults,
  buildTemplateGenerationInputFromSchema,
  createRequestIdentity,
  generateAiOptionVariantPreview,
  type AiOptionGenerationPreviewItem,
  type ProviderStatus
} from "@zebragate/shared";
import { getSupabaseAdminClient } from "./supabase.js";
import { ZebraGateApiError } from "../utils/errors.js";

export interface AdminAiConfigCatalog {
  providers: AdminProviderRecord[];
  runtimeTemplates: AdminRuntimeTemplateRecord[];
  models: AdminModelRecord[];
  dimensions: AdminDimensionRecord[];
  dimensionValues: AdminDimensionValueRecord[];
  aiOptions: AdminAiOptionRecord[];
}

export interface AdminProviderRecord {
  id: string;
  displayName: string;
  providerLabel: string;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  apiKeyPreview: string | null;
  status: string;
  healthStatus: string;
  isEnabled: boolean;
  disableReason: string | null;
  adminNote: string | null;
  migrationNote: string | null;
}

export interface AdminModelRecord {
  id: string;
  providerId: string;
  runtimeTemplateId: string | null;
  modelKey: string;
  modelLabel: string;
  upstreamModel: string;
  baseCreditMultiplier: number;
  status: string;
  isEnabled: boolean;
  sortOrder: number;
  adminNote: string | null;
}

export interface AdminRuntimeTemplateRecord {
  id: string;
  templateKey: string;
  name: string;
  description: string | null;
  parameterSchemaJson: unknown;
  isEnabled: boolean;
  adminNote: string | null;
  migrationNote: string | null;
}

export interface CreateAdminRuntimeTemplateInput {
  templateKey: string;
  name: string;
  description?: string | null;
  parameterSchemaJson?: unknown;
  isEnabled?: boolean;
  adminNote?: string | null;
}

export interface UpdateAdminRuntimeTemplateInput {
  templateKey?: string;
  name?: string;
  description?: string | null;
  parameterSchemaJson?: unknown;
  isEnabled?: boolean;
  adminNote?: string | null;
}

export interface AdminDimensionRecord {
  id: string;
  modelId: string;
  dimensionKey: string;
  label: string;
  sortOrder: number;
  isEnabled: boolean;
  adminNote: string | null;
}

export interface AdminDimensionValueRecord {
  id: string;
  dimensionId: string;
  valueKey: string;
  label: string;
  isDefault: boolean;
  omitWhenDefault: boolean;
  includeInSummary: boolean;
  creditMultiplierDelta: number;
  requestParameterFragment: unknown;
  dependsOn: unknown;
  sortOrder: number;
  isEnabled: boolean;
  adminNote: string | null;
}

export interface AdminAiOptionRecord {
  id: string;
  legacyRuntimePresetId: string | null;
  providerId: string;
  modelId: string;
  publicName: string;
  generatedConfigSummary: string;
  displayConfigSummary: string;
  displayConfigSummaryOverridden: boolean;
  generatedCreditMultiplier: number;
  creditMultiplier: number;
  creditMultiplierOverridden: boolean;
  actualRequestParametersJson: unknown;
  displayBadges: unknown;
  isRecommended: boolean;
  isPublic: boolean;
  isEnabled: boolean;
  status: ProviderStatus;
  healthStatus: ProviderStatus;
  disableReason: string | null;
  sortOrder: number;
  adminNote: string | null;
  generatedBy: string;
}

export interface UpdateAdminAiOptionInput {
  actualRequestParametersJson?: Record<string, unknown>;
  publicName?: string;
  displayConfigSummary?: string;
  displayConfigSummaryOverridden?: boolean;
  creditMultiplier?: number;
  creditMultiplierOverridden?: boolean;
  displayBadges?: unknown;
  isRecommended?: boolean;
  isPublic?: boolean;
  isEnabled?: boolean;
  status?: ProviderStatus;
  healthStatus?: ProviderStatus;
  disableReason?: string | null;
  sortOrder?: number;
  adminNote?: string | null;
}

export interface CreateAdminAiOptionInput {
  modelId: string;
  publicName: string;
  actualRequestParametersJson?: Record<string, unknown>;
  displayConfigSummary?: string;
  displayConfigSummaryOverridden?: boolean;
  creditMultiplier?: number;
  creditMultiplierOverridden?: boolean;
  displayBadges?: unknown;
  isRecommended?: boolean;
  isPublic?: boolean;
  isEnabled?: boolean;
  status?: ProviderStatus;
  healthStatus?: ProviderStatus;
  disableReason?: string | null;
  sortOrder?: number;
  adminNote?: string | null;
}

export interface CreateAdminProviderInput {
  displayName: string;
  providerLabel: string;
  baseUrl: string;
  apiKey?: string;
  defaultHeaders?: unknown;
  defaultQueryParams?: unknown;
  status?: ProviderStatus;
  healthStatus?: ProviderStatus;
  isEnabled?: boolean;
  disableReason?: string | null;
  adminNote?: string | null;
}

export interface UpdateAdminProviderInput {
  displayName?: string;
  providerLabel?: string;
  baseUrl?: string;
  apiKey?: string;
  defaultHeaders?: unknown;
  defaultQueryParams?: unknown;
  status?: ProviderStatus;
  healthStatus?: ProviderStatus;
  isEnabled?: boolean;
  disableReason?: string | null;
  adminNote?: string | null;
}

export interface CreateAdminModelInput {
  providerId: string;
  runtimeTemplateId?: string | null;
  modelKey: string;
  modelLabel: string;
  upstreamModel: string;
  baseCreditMultiplier?: number;
  status?: ProviderStatus;
  isEnabled?: boolean;
  sortOrder?: number;
  adminNote?: string | null;
}

export interface UpdateAdminModelInput {
  runtimeTemplateId?: string | null;
  modelKey?: string;
  modelLabel?: string;
  upstreamModel?: string;
  baseCreditMultiplier?: number;
  status?: ProviderStatus;
  isEnabled?: boolean;
  sortOrder?: number;
  adminNote?: string | null;
}

export interface ApplyAiOptionGenerationResult {
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  items: Array<{
    action: AiOptionGenerationPreviewItem["action"] | "skipped";
    legacyRuntimePresetId?: string;
    aiOptionId?: string;
    publicName: string;
    conflictDetails: string[];
  }>;
}

export interface AdminAiConfigRepository {
  listCatalog(): Promise<AdminAiConfigCatalog>;
  getGenerationData(modelId: string): Promise<{
    catalog: AdminAiConfigCatalog;
    model: AdminModelRecord;
  }>;
  applyGenerationPreview(preview: AiOptionGenerationPreviewItem[]): Promise<ApplyAiOptionGenerationResult>;
  createAiOption(input: CreateAdminAiOptionInput): Promise<AdminAiOptionRecord>;
  createRuntimeTemplate(input: CreateAdminRuntimeTemplateInput): Promise<AdminRuntimeTemplateRecord>;
  deleteAiOption(optionId: string): Promise<void>;
  deleteRuntimeTemplate(runtimeTemplateId: string): Promise<void>;
  updateAiOption(optionId: string, input: UpdateAdminAiOptionInput): Promise<AdminAiOptionRecord>;
  updateRuntimeTemplate(
    runtimeTemplateId: string,
    input: UpdateAdminRuntimeTemplateInput
  ): Promise<AdminRuntimeTemplateRecord>;
  createProvider(input: CreateAdminProviderInput): Promise<AdminProviderRecord>;
  updateProvider(providerId: string, input: UpdateAdminProviderInput): Promise<AdminProviderRecord>;
  deleteProvider(providerId: string): Promise<void>;
  createModel(input: CreateAdminModelInput): Promise<AdminModelRecord>;
  updateModel(modelId: string, input: UpdateAdminModelInput): Promise<AdminModelRecord>;
  deleteModel(modelId: string): Promise<void>;
}

export async function previewAiOptionGeneration(
  repository: AdminAiConfigRepository,
  runtimeTemplateId: string
): Promise<AiOptionGenerationPreviewItem[]> {
  const modelId = await resolveGenerationModelIdForRuntimeTemplate(repository, runtimeTemplateId);
  const { catalog, model } = await repository.getGenerationData(modelId);
  const runtimeTemplate = catalog.runtimeTemplates.find((candidate) => candidate.id === runtimeTemplateId) ?? null;
  const templateGeneration = runtimeTemplate
    ? buildTemplateGenerationInputFromSchema(toObjectRecord(runtimeTemplate.parameterSchemaJson))
    : null;
  if (!templateGeneration) {
    return [];
  }

  const preview = generateAiOptionVariantPreview({
    model: {
      id: model.id,
      providerId: model.providerId,
      modelLabel: model.modelLabel,
      baseCreditMultiplier: model.baseCreditMultiplier
    },
    dimensions: templateGeneration.dimensions,
    existingAiOptions: catalog.aiOptions
      .filter((option) => option.generatedBy === "admin_generator")
      .map((option) => ({
        id: option.id,
        modelId: option.modelId,
        requestParameters: toObjectRecord(option.actualRequestParametersJson),
        publicName: option.publicName,
        generatedConfigSummary: option.generatedConfigSummary,
        displayConfigSummary: option.displayConfigSummary,
        displayConfigSummaryOverridden: option.displayConfigSummaryOverridden,
        generatedCreditMultiplier: option.generatedCreditMultiplier,
        creditMultiplier: option.creditMultiplier,
        creditMultiplierOverridden: option.creditMultiplierOverridden
      }))
  });

  return preview.map((item) =>
    applyTemplateCreditRules(
      applyTemplateRequestDefaults(item, templateGeneration.requestDefaults),
      model.baseCreditMultiplier,
      templateGeneration.creditBaseMultiplier,
      templateGeneration.creditCombinationRules
    )
  );
}

export async function applyAiOptionGeneration(
  repository: AdminAiConfigRepository,
  runtimeTemplateId: string,
  targetNormalizedParameterValues?: Record<string, string>
): Promise<ApplyAiOptionGenerationResult> {
  const preview = await previewAiOptionGeneration(repository, runtimeTemplateId);

  if (!targetNormalizedParameterValues) {
    return repository.applyGenerationPreview(preview);
  }

  const targetItem = preview.find((item) =>
    isSameNormalizedParameterValues(item.normalizedParameterValues, targetNormalizedParameterValues)
  );

  if (!targetItem) {
    throw new ZebraGateApiError("BAD_REQUEST", "No matching AI option suggestion was found.", 404);
  }

  return repository.applyGenerationPreview([targetItem]);
}

function isSameNormalizedParameterValues(
  left: Record<string, string>,
  right: Record<string, string>
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

async function resolveGenerationModelIdForRuntimeTemplate(
  repository: AdminAiConfigRepository,
  runtimeTemplateId: string
): Promise<string> {
  const catalog = await repository.listCatalog();
  const runtimeTemplate = catalog.runtimeTemplates.find((candidate) => candidate.id === runtimeTemplateId);
  if (!runtimeTemplate) {
    throw new ZebraGateApiError("BAD_REQUEST", "Runtime template was not found.", 404);
  }

  const model = [...catalog.models]
    .filter((candidate) => candidate.runtimeTemplateId === runtimeTemplateId)
    .sort((left, right) => left.sortOrder - right.sortOrder)[0];

  if (!model) {
    throw new ZebraGateApiError("BAD_REQUEST", "No model is currently bound to this runtime template.", 409);
  }

  return model.id;
}

export function normalizeCreateAdminAiOptionInput(input: CreateAdminAiOptionInput): CreateAdminAiOptionInput {
  return {
    ...input,
    status: normalizeAdminAiConfigStatus(input.status),
    healthStatus: normalizeAdminAiConfigStatus(input.healthStatus)
  };
}

export function normalizeCreateAdminRuntimeTemplateInput(
  input: CreateAdminRuntimeTemplateInput
): CreateAdminRuntimeTemplateInput {
  return {
    ...input
  };
}

export function normalizeUpdateAdminAiOptionInput(input: UpdateAdminAiOptionInput): UpdateAdminAiOptionInput {
  return {
    ...input,
    ...(Object.prototype.hasOwnProperty.call(input, "status")
      ? { status: normalizeAdminAiConfigStatus(input.status) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "healthStatus")
      ? { healthStatus: normalizeAdminAiConfigStatus(input.healthStatus) }
      : {})
  };
}

export function normalizeUpdateAdminRuntimeTemplateInput(
  input: UpdateAdminRuntimeTemplateInput
): UpdateAdminRuntimeTemplateInput {
  return {
    ...input
  };
}

export function normalizeCreateAdminProviderInput(input: CreateAdminProviderInput): CreateAdminProviderInput {
  return {
    ...input,
    status: normalizeAdminAiConfigStatus(input.status),
    healthStatus: normalizeAdminAiConfigStatus(input.healthStatus)
  };
}

export function normalizeUpdateAdminProviderInput(input: UpdateAdminProviderInput): UpdateAdminProviderInput {
  return {
    ...input,
    ...(Object.prototype.hasOwnProperty.call(input, "status")
      ? { status: normalizeAdminAiConfigStatus(input.status) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "healthStatus")
      ? { healthStatus: normalizeAdminAiConfigStatus(input.healthStatus) }
      : {})
  };
}

export function normalizeCreateAdminModelInput(input: CreateAdminModelInput): CreateAdminModelInput {
  return {
    ...input,
    status: normalizeAdminAiConfigStatus(input.status)
  };
}

export function normalizeUpdateAdminModelInput(input: UpdateAdminModelInput): UpdateAdminModelInput {
  return {
    ...input,
    ...(Object.prototype.hasOwnProperty.call(input, "status")
      ? { status: normalizeAdminAiConfigStatus(input.status) }
      : {})
  };
}

export function createSupabaseAdminAiConfigRepository(): AdminAiConfigRepository {
  return {
    async listCatalog(): Promise<AdminAiConfigCatalog> {
      const client = getSupabaseAdminClient();
      const [providers, runtimeTemplates, models, dimensions, dimensionValues, aiOptions] =
        await Promise.all([
          selectAll<AiProviderRow>("ai_providers", "created_at"),
          selectAll<AiRuntimeTemplateRow>("ai_runtime_templates", "created_at"),
          selectAll<AiModelRow>("ai_models", "sort_order"),
          selectAll<AiModelDimensionRow>("ai_model_dimensions", "sort_order"),
          selectAll<AiModelDimensionValueRow>("ai_model_dimension_values", "sort_order"),
          selectAll<AiOptionRow>("ai_options", "sort_order")
        ]);

      void client;

      return {
        providers: providers.map(toAdminProviderRecord),
        runtimeTemplates: runtimeTemplates.map(toAdminRuntimeTemplateRecord),
        models: models.map(toAdminModelRecord),
        dimensions: dimensions.map(toAdminDimensionRecord),
        dimensionValues: dimensionValues.map(toAdminDimensionValueRecord),
        aiOptions: aiOptions.map(toAdminAiOptionRecord)
      };
    },

    async getGenerationData(modelId: string) {
      const catalog = await this.listCatalog();
      const model = catalog.models.find((candidate) => candidate.id === modelId);

      if (!model) {
        throw new ZebraGateApiError("BAD_REQUEST", "AI model was not found.", 404);
      }

      return {
        catalog,
        model
      };
    },

    async applyGenerationPreview(preview: AiOptionGenerationPreviewItem[]): Promise<ApplyAiOptionGenerationResult> {
      const result: ApplyAiOptionGenerationResult = {
        created: 0,
        updated: 0,
        skipped: 0,
        conflicts: 0,
        items: []
      };

      for (const item of preview) {
        if (item.action === "conflict") {
          result.conflicts += 1;
          result.items.push({
            action: "conflict",
            publicName: item.publicName,
            conflictDetails: item.conflictDetails
          });
          continue;
        }

        if (item.action === "exists") {
          result.skipped += 1;
          result.items.push({
            action: "skipped",
            aiOptionId: item.existingAiOptionId,
            publicName: item.publicName,
            conflictDetails: []
          });
          continue;
        }

        if (item.action === "create") {
          const insertResult = await insertAiOptionRecord(
            this,
            buildGeneratedAiOptionInsertPayload(item)
          );

          if (insertResult.status === "duplicate") {
            result.skipped += 1;
            result.items.push({
              action: "skipped",
              aiOptionId: insertResult.duplicate.id,
              publicName: item.publicName,
              conflictDetails: []
            });
            continue;
          }

          result.created += 1;
          result.items.push({
            action: "create",
            aiOptionId: insertResult.created.id,
            publicName: item.publicName,
            conflictDetails: []
          });
          continue;
        }

        if (item.action === "update" && item.existingRuntimePresetId && item.existingAiOptionId) {
          await updateGeneratedAiOption(item);
          result.updated += 1;
          result.items.push({
            action: "update",
            aiOptionId: item.existingAiOptionId,
            publicName: item.publicName,
            conflictDetails: []
          });
        }
      }

      return result;
    },

    async createAiOption(input: CreateAdminAiOptionInput): Promise<AdminAiOptionRecord> {
      const normalizedInput = normalizeCreateAdminAiOptionInput(input);
      const modelId = normalizedInput.modelId.trim();
      const publicName = normalizedInput.publicName.trim();
      if (!modelId) {
        throw new ZebraGateApiError("BAD_REQUEST", "modelId is required.", 400);
      }

      if (!publicName) {
        throw new ZebraGateApiError("BAD_REQUEST", "publicName is required.", 400);
      }

      const catalog = await this.listCatalog();
      const model = catalog.models.find((candidate) => candidate.id === modelId);
      if (!model) {
        throw new ZebraGateApiError("BAD_REQUEST", "AI model was not found.", 404);
      }

      const requestParametersJson = normalizedInput.actualRequestParametersJson ?? {};
      const now = new Date().toISOString();
      const insertResult = await insertAiOptionRecord(this, {
        runtime_preset_id: null,
        provider_id: model.providerId,
        model_id: model.id,
        public_name: publicName,
        generated_config_summary: "",
        display_config_summary: normalizedInput.displayConfigSummary?.trim() ?? "",
        display_config_summary_overridden: normalizedInput.displayConfigSummaryOverridden ?? false,
        generated_credit_multiplier: model.baseCreditMultiplier,
        credit_multiplier: normalizedInput.creditMultiplier ?? model.baseCreditMultiplier,
        credit_multiplier_overridden: normalizedInput.creditMultiplierOverridden ?? false,
        actual_request_parameters_json: requestParametersJson,
        display_badges: normalizedInput.displayBadges ?? [],
        is_recommended: normalizedInput.isRecommended ?? false,
        is_public: normalizedInput.isPublic ?? false,
        is_enabled: normalizedInput.isEnabled ?? false,
        status: normalizedInput.status ?? "unknown",
        health_status: normalizedInput.healthStatus ?? "unknown",
        disable_reason: normalizedInput.disableReason ?? null,
        sort_order: normalizedInput.sortOrder ?? 0,
        admin_note: normalizedInput.adminNote ?? null,
        generated_by: "manual",
        created_at: now,
        updated_at: now
      });

      if (insertResult.status === "duplicate") {
        throw new ZebraGateApiError(
          "BAD_REQUEST",
          "An AI option with the same request parameters already exists for this model.",
          409
        );
      }

      return insertResult.created;
    },

    async createRuntimeTemplate(input: CreateAdminRuntimeTemplateInput): Promise<AdminRuntimeTemplateRecord> {
      const normalizedInput = normalizeCreateAdminRuntimeTemplateInput(input);
      const templateKey = normalizedInput.templateKey?.trim() ?? "";
      const name = normalizedInput.name?.trim() ?? "";

      if (!templateKey) {
        throw new ZebraGateApiError("BAD_REQUEST", "templateKey is required.", 400);
      }

      if (!name) {
        throw new ZebraGateApiError("BAD_REQUEST", "name is required.", 400);
      }

      const now = new Date().toISOString();
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("ai_runtime_templates")
        .insert({
          template_key: templateKey,
          name,
          description: normalizedInput.description ?? null,
          parameter_schema_json: normalizedInput.parameterSchemaJson ?? { parameters: {} },
          is_enabled: normalizedInput.isEnabled ?? true,
          admin_note: normalizedInput.adminNote ?? null,
          migration_note: null,
          created_at: now,
          updated_at: now
        })
        .select("*")
        .single();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return toAdminRuntimeTemplateRecord(data as AiRuntimeTemplateRow);
    },

    async deleteAiOption(optionId: string): Promise<void> {
      if (!optionId.trim()) {
        throw new ZebraGateApiError("BAD_REQUEST", "optionId is required.", 400);
      }

      const client = getSupabaseAdminClient();
      const { data: existing, error: fetchError } = await client
        .from("ai_options")
        .select("runtime_preset_id")
        .eq("id", optionId)
        .maybeSingle();

      if (fetchError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", fetchError.message, 500);
      }

      if (!existing) {
        throw new ZebraGateApiError("BAD_REQUEST", "AI option was not found.", 404);
      }

      const { error } = await client.from("ai_options").delete().eq("id", optionId);
      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }
    },

    async deleteRuntimeTemplate(runtimeTemplateId: string): Promise<void> {
      if (!runtimeTemplateId.trim()) {
        throw new ZebraGateApiError("BAD_REQUEST", "runtimeTemplateId is required.", 400);
      }

      const client = getSupabaseAdminClient();
      const { count, error: modelError } = await client
        .from("ai_models")
        .select("id", { count: "exact", head: true })
        .eq("runtime_template_id", runtimeTemplateId);

      if (modelError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", modelError.message, 500);
      }

      if (count) {
        throw new ZebraGateApiError(
          "BAD_REQUEST",
          "Cannot delete a runtime template that is still bound by models. Unbind those models first.",
          409
        );
      }

      await assertRowExists(client, "ai_runtime_templates", "id", runtimeTemplateId, "Runtime template was not found.");
      const { error } = await client.from("ai_runtime_templates").delete().eq("id", runtimeTemplateId);
      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }
    },

    async updateAiOption(optionId: string, input: UpdateAdminAiOptionInput): Promise<AdminAiOptionRecord> {
      const normalizedInput = normalizeUpdateAdminAiOptionInput(input);
      const updatePayload = toAiOptionUpdatePayload(normalizedInput);
      if (Object.keys(updatePayload).length === 0) {
        throw new ZebraGateApiError("BAD_REQUEST", "No supported AI option fields were provided.", 400);
      }

      if (Object.prototype.hasOwnProperty.call(normalizedInput, "actualRequestParametersJson")) {
        const catalog = await this.listCatalog();
        const currentOption = catalog.aiOptions.find((option) => option.id === optionId);
        if (!currentOption) {
          throw new ZebraGateApiError("BAD_REQUEST", "AI option was not found.", 404);
        }

        const requestParametersJson = normalizedInput.actualRequestParametersJson ?? {};
        if (
          findDuplicateAiOptionByRequestParameters(
            catalog.aiOptions,
            currentOption.modelId,
            requestParametersJson,
            optionId
          )
        ) {
          throw new ZebraGateApiError(
            "BAD_REQUEST",
            "An AI option with the same request parameters already exists for this model.",
            409
          );
        }
      }

      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("ai_options")
        .update({
          ...updatePayload,
          updated_at: new Date().toISOString()
        })
        .eq("id", optionId)
        .select("*")
        .single();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return toAdminAiOptionRecord(data as AiOptionRow);
    },

    async updateRuntimeTemplate(
      runtimeTemplateId: string,
      input: UpdateAdminRuntimeTemplateInput
    ): Promise<AdminRuntimeTemplateRecord> {
      const updatePayload = toRuntimeTemplateUpdatePayload(normalizeUpdateAdminRuntimeTemplateInput(input));
      if (Object.keys(updatePayload).length === 0) {
        throw new ZebraGateApiError("BAD_REQUEST", "No supported runtime template fields were provided.", 400);
      }

      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("ai_runtime_templates")
        .update({
          ...updatePayload,
          updated_at: new Date().toISOString()
        })
        .eq("id", runtimeTemplateId)
        .select("*")
        .single();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return toAdminRuntimeTemplateRecord(data as AiRuntimeTemplateRow);
    },

    async createProvider(input: CreateAdminProviderInput): Promise<AdminProviderRecord> {
      const normalizedInput = normalizeCreateAdminProviderInput(input);
      const displayName = normalizedInput.displayName.trim();
      const providerLabel = normalizedInput.providerLabel.trim();
      const baseUrl = normalizedInput.baseUrl.trim();

      if (!displayName) {
        throw new ZebraGateApiError("BAD_REQUEST", "displayName is required.", 400);
      }

      if (!providerLabel) {
        throw new ZebraGateApiError("BAD_REQUEST", "providerLabel is required.", 400);
      }

      if (!baseUrl) {
        throw new ZebraGateApiError("BAD_REQUEST", "baseUrl is required.", 400);
      }

      const now = new Date().toISOString();
      const client = getSupabaseAdminClient();
      const apiKey = normalizedInput.apiKey?.trim();
      const insertPayload = {
        display_name: displayName,
        provider_label: providerLabel,
        base_url: baseUrl,
        api_key_encrypted: apiKey ? apiKey : null,
        default_headers: normalizedInput.defaultHeaders ?? {},
        default_query_params: normalizedInput.defaultQueryParams ?? {},
        model: "",
        credit_multiplier: 1,
        status: normalizedInput.status ?? "unknown",
        health_status: normalizedInput.healthStatus ?? "unknown",
        is_enabled: normalizedInput.isEnabled ?? true,
        disable_reason: normalizedInput.disableReason ?? null,
        admin_note: normalizedInput.adminNote ?? null,
        migration_note: null,
        created_at: now,
        updated_at: now
      };

      const { data, error } = await client.from("ai_providers").insert(insertPayload).select("*").single();
      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return toAdminProviderRecord(data as AiProviderRow);
    },

    async updateProvider(providerId: string, input: UpdateAdminProviderInput): Promise<AdminProviderRecord> {
      const updatePayload = toProviderUpdatePayload(normalizeUpdateAdminProviderInput(input));
      if (Object.keys(updatePayload).length === 0) {
        throw new ZebraGateApiError("BAD_REQUEST", "No supported provider fields were provided.", 400);
      }

      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from("ai_providers")
        .update({
          ...updatePayload,
          updated_at: new Date().toISOString()
        })
        .eq("id", providerId)
        .select("*")
        .single();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return toAdminProviderRecord(data as AiProviderRow);
    },

    async deleteProvider(providerId: string): Promise<void> {
      if (!providerId.trim()) {
        throw new ZebraGateApiError("BAD_REQUEST", "providerId is required.", 400);
      }

      const client = getSupabaseAdminClient();
      const { count: modelCount, error: modelError } = await client
        .from("ai_models")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId);

      if (modelError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", modelError.message, 500);
      }

      if (modelCount) {
        throw new ZebraGateApiError(
          "BAD_REQUEST",
          "Cannot delete a provider that still has models. Delete its models first.",
          409
        );
      }

      await assertRowExists(client, "ai_providers", "id", providerId, "Provider was not found.");
      const { error } = await client.from("ai_providers").delete().eq("id", providerId);
      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }
    },

    async createModel(input: CreateAdminModelInput): Promise<AdminModelRecord> {
      const normalizedInput = normalizeCreateAdminModelInput(input);
      const providerId = normalizedInput.providerId.trim();
      const modelKey = normalizedInput.modelKey.trim();
      const modelLabel = normalizedInput.modelLabel.trim();
      const upstreamModel = normalizedInput.upstreamModel.trim();

      if (!providerId) {
        throw new ZebraGateApiError("BAD_REQUEST", "providerId is required.", 400);
      }

      if (!modelKey) {
        throw new ZebraGateApiError("BAD_REQUEST", "modelKey is required.", 400);
      }

      if (!modelLabel) {
        throw new ZebraGateApiError("BAD_REQUEST", "modelLabel is required.", 400);
      }

      if (!upstreamModel) {
        throw new ZebraGateApiError("BAD_REQUEST", "upstreamModel is required.", 400);
      }

      const now = new Date().toISOString();
      const client = getSupabaseAdminClient();
      if (normalizedInput.runtimeTemplateId) {
        await assertRowExists(
          client,
          "ai_runtime_templates",
          "id",
          normalizedInput.runtimeTemplateId,
          "Runtime template was not found."
        );
      }
      const insertPayload = {
        provider_id: providerId,
        runtime_template_id: normalizedInput.runtimeTemplateId ?? null,
        model_key: modelKey,
        model_label: modelLabel,
        upstream_model: upstreamModel,
        base_credit_multiplier: normalizedInput.baseCreditMultiplier ?? 1,
        status: normalizedInput.status ?? "unknown",
        is_enabled: normalizedInput.isEnabled ?? true,
        sort_order: normalizedInput.sortOrder ?? 0,
        admin_note: normalizedInput.adminNote ?? null,
        migration_note: null,
        created_at: now,
        updated_at: now
      };

      const { data, error } = await client.from("ai_models").insert(insertPayload).select("*").single();
      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return toAdminModelRecord(data as AiModelRow);
    },

    async updateModel(modelId: string, input: UpdateAdminModelInput): Promise<AdminModelRecord> {
      const updatePayload = toModelUpdatePayload(normalizeUpdateAdminModelInput(input));
      if (Object.keys(updatePayload).length === 0) {
        throw new ZebraGateApiError("BAD_REQUEST", "No supported model fields were provided.", 400);
      }

      const client = getSupabaseAdminClient();
      if (Object.prototype.hasOwnProperty.call(updatePayload, "runtime_template_id") && updatePayload.runtime_template_id) {
        await assertRowExists(
          client,
          "ai_runtime_templates",
          "id",
          String(updatePayload.runtime_template_id),
          "Runtime template was not found."
        );
      }
      const { data, error } = await client
        .from("ai_models")
        .update({
          ...updatePayload,
          updated_at: new Date().toISOString()
        })
        .eq("id", modelId)
        .select("*")
        .single();

      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      return toAdminModelRecord(data as AiModelRow);
    },

    async deleteModel(modelId: string): Promise<void> {
      if (!modelId.trim()) {
        throw new ZebraGateApiError("BAD_REQUEST", "modelId is required.", 400);
      }

      const client = getSupabaseAdminClient();
      const { count: presetCount, error: presetError } = await client
        .from("ai_runtime_presets")
        .select("id", { count: "exact", head: true })
        .eq("model_id", modelId);

      if (presetError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", presetError.message, 500);
      }

      const { count: optionCount, error: optionError } = await client
        .from("ai_options")
        .select("id", { count: "exact", head: true })
        .eq("model_id", modelId);

      if (optionError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", optionError.message, 500);
      }

      if (presetCount || optionCount) {
        throw new ZebraGateApiError(
          "BAD_REQUEST",
          "Cannot delete a model that still has AI options or legacy runtime presets. Delete those first.",
          409
        );
      }

      await assertRowExists(client, "ai_models", "id", modelId, "Model was not found.");
      const { error } = await client.from("ai_models").delete().eq("id", modelId);
      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }
    }
  };
}

function buildGeneratedAiOptionInsertPayload(item: AiOptionGenerationPreviewItem): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    runtime_preset_id: null,
    provider_id: item.providerId,
    model_id: item.modelId,
    public_name: item.publicName,
    generated_config_summary: item.generatedConfigSummary,
    display_config_summary: item.displayConfigSummary,
    display_config_summary_overridden: item.displayConfigSummaryOverridden,
    generated_credit_multiplier: item.generatedCreditMultiplier,
    credit_multiplier: item.creditMultiplier,
    credit_multiplier_overridden: item.creditMultiplierOverridden,
    actual_request_parameters_json: item.requestParameters,
    display_badges: [],
    is_recommended: false,
    is_public: false,
    is_enabled: false,
    status: "unknown",
    health_status: "unknown",
    sort_order: 0,
    generated_by: "admin_generator",
    created_at: now,
    updated_at: now
  };
}

type InsertAiOptionResult =
  | { status: "created"; created: AdminAiOptionRecord }
  | { status: "duplicate"; duplicate: AdminAiOptionRecord };

async function insertAiOptionRecord(
  repository: AdminAiConfigRepository,
  insertPayload: Record<string, unknown>
): Promise<InsertAiOptionResult> {
  const catalog = await repository.listCatalog();
  const duplicate = findDuplicateAiOptionByRequestParameters(
    catalog.aiOptions,
    insertPayload.model_id as string,
    toObjectRecord(insertPayload.actual_request_parameters_json)
  );

  if (duplicate) {
    return { status: "duplicate", duplicate };
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("ai_options").insert(insertPayload).select("*").single();
  if (error) {
    throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
  }

  return { status: "created", created: toAdminAiOptionRecord(data as AiOptionRow) };
}

async function updateGeneratedAiOption(item: AiOptionGenerationPreviewItem): Promise<void> {
  const client = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error: optionError } = await client
    .from("ai_options")
    .update(buildGeneratedAiOptionUpdatePayload(item, now))
    .eq("id", item.existingAiOptionId);

  if (optionError) {
    throw new ZebraGateApiError("INTERNAL_ERROR", optionError.message, 500);
  }
}

export function buildGeneratedAiOptionUpdatePayload(item: AiOptionGenerationPreviewItem, updatedAt: string): Record<string, unknown> {
  return {
    generated_config_summary: item.generatedConfigSummary,
    display_config_summary: item.displayConfigSummary,
    display_config_summary_overridden: item.displayConfigSummaryOverridden,
    generated_credit_multiplier: item.generatedCreditMultiplier,
    credit_multiplier: item.creditMultiplier,
    credit_multiplier_overridden: item.creditMultiplierOverridden,
    actual_request_parameters_json: item.requestParameters,
    updated_at: updatedAt
  };
}

export function findDuplicateAiOptionByRequestParameters(
  aiOptions: AdminAiOptionRecord[],
  modelId: string,
  requestParametersJson: Record<string, unknown>,
  excludeOptionId?: string
): AdminAiOptionRecord | undefined {
  const requestIdentity = createRequestIdentity(requestParametersJson);

  return aiOptions.find(
    (option) =>
      option.id !== excludeOptionId &&
      option.modelId === modelId &&
      createRequestIdentity(toObjectRecord(option.actualRequestParametersJson)) === requestIdentity
  );
}

async function selectAll<Row>(table: string, orderColumn: string): Promise<Row[]> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(table)
    .select("*")
    .order(orderColumn, { ascending: true });

  if (error) {
    throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
  }

  return (data ?? []) as Row[];
}

async function assertRowExists(
  client: ReturnType<typeof getSupabaseAdminClient>,
  table: string,
  idColumn: string,
  id: string,
  notFoundMessage: string
): Promise<void> {
  const { count, error } = await client
    .from(table)
    .select(idColumn, { count: "exact", head: true })
    .eq(idColumn, id);

  if (error) {
    throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
  }

  if (!count) {
    throw new ZebraGateApiError("BAD_REQUEST", notFoundMessage, 404);
  }
}

function toAdminProviderRecord(row: AiProviderRow): AdminProviderRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    providerLabel: row.provider_label,
    baseUrlConfigured: row.base_url.length > 0,
    apiKeyConfigured: Boolean(row.api_key_encrypted),
    apiKeyPreview: row.api_key_encrypted ? maskSecret(row.api_key_encrypted) : null,
    status: normalizeAdminAiConfigStatus(row.status),
    healthStatus: normalizeAdminAiConfigStatus(row.health_status),
    isEnabled: row.is_enabled,
    disableReason: row.disable_reason,
    adminNote: row.admin_note,
    migrationNote: row.migration_note
  };
}

function toAdminRuntimeTemplateRecord(row: AiRuntimeTemplateRow): AdminRuntimeTemplateRecord {
  return {
    id: row.id,
    templateKey: row.template_key,
    name: row.name,
    description: row.description,
    parameterSchemaJson: row.parameter_schema_json,
    isEnabled: row.is_enabled,
    adminNote: row.admin_note,
    migrationNote: row.migration_note
  };
}

function toAdminModelRecord(row: AiModelRow): AdminModelRecord {
  return {
    id: row.id,
    providerId: row.provider_id,
    runtimeTemplateId: row.runtime_template_id,
    modelKey: row.model_key,
    modelLabel: row.model_label,
    upstreamModel: row.upstream_model,
    baseCreditMultiplier: row.base_credit_multiplier,
    status: row.status,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
    adminNote: row.admin_note
  };
}

function toAdminDimensionRecord(row: AiModelDimensionRow): AdminDimensionRecord {
  return {
    id: row.id,
    modelId: row.model_id,
    dimensionKey: row.dimension_key,
    label: row.label,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    adminNote: row.admin_note
  };
}

function toAdminDimensionValueRecord(row: AiModelDimensionValueRow): AdminDimensionValueRecord {
  return {
    id: row.id,
    dimensionId: row.dimension_id,
    valueKey: row.value_key,
    label: row.label,
    isDefault: row.is_default,
    omitWhenDefault: row.omit_when_default,
    includeInSummary: row.include_in_summary,
    creditMultiplierDelta: row.credit_multiplier_delta,
    requestParameterFragment: row.request_parameter_fragment,
    dependsOn: row.depends_on,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    adminNote: row.admin_note
  };
}

function toAdminAiOptionRecord(row: AiOptionRow): AdminAiOptionRecord {
  return {
    id: row.id,
    legacyRuntimePresetId: row.runtime_preset_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    publicName: row.public_name,
    generatedConfigSummary: row.generated_config_summary,
    displayConfigSummary: row.display_config_summary,
    displayConfigSummaryOverridden: row.display_config_summary_overridden,
    generatedCreditMultiplier: row.generated_credit_multiplier,
    creditMultiplier: row.credit_multiplier,
    creditMultiplierOverridden: row.credit_multiplier_overridden,
    actualRequestParametersJson: row.actual_request_parameters_json,
    displayBadges: row.display_badges,
    isRecommended: row.is_recommended,
    isPublic: row.is_public,
    isEnabled: row.is_enabled,
    status: normalizeAdminAiConfigStatus(row.status),
    healthStatus: normalizeAdminAiConfigStatus(row.health_status),
    disableReason: row.disable_reason,
    sortOrder: row.sort_order,
    adminNote: row.admin_note,
    generatedBy: row.generated_by
  };
}

function toAiOptionUpdatePayload(input: UpdateAdminAiOptionInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const fieldMap: Array<[keyof UpdateAdminAiOptionInput, string]> = [
    ["actualRequestParametersJson", "actual_request_parameters_json"],
    ["publicName", "public_name"],
    ["displayConfigSummary", "display_config_summary"],
    ["displayConfigSummaryOverridden", "display_config_summary_overridden"],
    ["creditMultiplier", "credit_multiplier"],
    ["creditMultiplierOverridden", "credit_multiplier_overridden"],
    ["displayBadges", "display_badges"],
    ["isRecommended", "is_recommended"],
    ["isPublic", "is_public"],
    ["isEnabled", "is_enabled"],
    ["status", "status"],
    ["healthStatus", "health_status"],
    ["disableReason", "disable_reason"],
    ["sortOrder", "sort_order"],
    ["adminNote", "admin_note"]
  ];

  for (const [inputKey, dbKey] of fieldMap) {
    if (Object.prototype.hasOwnProperty.call(input, inputKey)) {
      payload[dbKey] = input[inputKey];
    }
  }

  return payload;
}

function toRuntimeTemplateUpdatePayload(input: UpdateAdminRuntimeTemplateInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, "templateKey")) {
    payload.template_key = input.templateKey?.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "name")) {
    payload.name = input.name?.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    payload.description = input.description ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "parameterSchemaJson")) {
    payload.parameter_schema_json = input.parameterSchemaJson ?? { parameters: {} };
  }

  if (Object.prototype.hasOwnProperty.call(input, "isEnabled")) {
    payload.is_enabled = input.isEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(input, "adminNote")) {
    payload.admin_note = input.adminNote;
  }

  return payload;
}

function toProviderUpdatePayload(input: UpdateAdminProviderInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, "displayName")) {
    payload.display_name = input.displayName?.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "providerLabel")) {
    payload.provider_label = input.providerLabel?.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "baseUrl")) {
    const baseUrl = input.baseUrl?.trim();
    if (baseUrl) {
      payload.base_url = baseUrl;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "apiKey")) {
    const apiKey = input.apiKey?.trim();
    if (apiKey) {
      payload.api_key_encrypted = apiKey;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "defaultHeaders")) {
    payload.default_headers = input.defaultHeaders ?? {};
  }

  if (Object.prototype.hasOwnProperty.call(input, "defaultQueryParams")) {
    payload.default_query_params = input.defaultQueryParams ?? {};
  }

  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    payload.status = input.status;
  }

  if (Object.prototype.hasOwnProperty.call(input, "healthStatus")) {
    payload.health_status = input.healthStatus;
  }

  if (Object.prototype.hasOwnProperty.call(input, "isEnabled")) {
    payload.is_enabled = input.isEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(input, "disableReason")) {
    payload.disable_reason = input.disableReason;
  }

  if (Object.prototype.hasOwnProperty.call(input, "adminNote")) {
    payload.admin_note = input.adminNote;
  }

  return payload;
}

function toModelUpdatePayload(input: UpdateAdminModelInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, "modelKey")) {
    payload.model_key = input.modelKey?.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "runtimeTemplateId")) {
    payload.runtime_template_id = input.runtimeTemplateId ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "modelLabel")) {
    payload.model_label = input.modelLabel?.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "upstreamModel")) {
    payload.upstream_model = input.upstreamModel?.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "baseCreditMultiplier")) {
    payload.base_credit_multiplier = input.baseCreditMultiplier;
  }

  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    payload.status = input.status;
  }

  if (Object.prototype.hasOwnProperty.call(input, "isEnabled")) {
    payload.is_enabled = input.isEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(input, "sortOrder")) {
    payload.sort_order = input.sortOrder;
  }

  if (Object.prototype.hasOwnProperty.call(input, "adminNote")) {
    payload.admin_note = input.adminNote;
  }

  return payload;
}

function normalizeAdminAiConfigStatus(value: unknown): ProviderStatus {
  const status = typeof value === "string" ? value.trim() : "";
  return PROVIDER_STATUS_VALUES.includes(status as (typeof PROVIDER_STATUS_VALUES)[number])
    ? (status as ProviderStatus)
    : "unknown";
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "configured";
  }

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

