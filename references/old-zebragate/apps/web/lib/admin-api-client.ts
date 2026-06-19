import "server-only";
import type { ProviderStatus } from "@zebragate/shared";

const apiBaseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export interface AdminAiConfigCatalog {
  providers: AdminProviderRecord[];
  runtimeTemplates: AdminRuntimeTemplateRecord[];
  models: AdminModelRecord[];
  dimensions: AdminDimensionRecord[];
  dimensionValues: AdminDimensionValueRecord[];
  aiOptions: AdminAiOptionRecord[];
}

interface AdminAiConfigCatalogResponse {
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

export interface CreateAdminAiOptionInput {
  modelId: string;
  publicName: string;
  actualRequestParametersJson?: Record<string, unknown>;
  displayConfigSummary?: string;
  displayConfigSummaryOverridden?: boolean;
  creditMultiplier?: number;
  creditMultiplierOverridden?: boolean;
  status?: ProviderStatus;
  healthStatus?: ProviderStatus;
  isRecommended?: boolean;
  isPublic?: boolean;
  isEnabled?: boolean;
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

export interface CreateAdminProviderInput {
  displayName: string;
  providerLabel: string;
  baseUrl: string;
  apiKey?: string;
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

export interface AdminAiOptionPreviewItem {
  action: "create" | "exists" | "update" | "conflict";
  modelId: string;
  providerId: string;
  publicName: string;
  normalizedParameterValues: Record<string, string>;
  requestParameters: unknown;
  hasRequestParameterConflict: boolean;
  conflictDetails: string[];
  generatedConfigSummary: string;
  displayConfigSummary: string;
  displayConfigSummaryOverridden: boolean;
  generatedCreditMultiplier: number;
  creditMultiplier: number;
  creditMultiplierOverridden: boolean;
  existingRuntimePresetId?: string;
  existingAiOptionId?: string;
}

export async function getAdminAiConfigCatalog(): Promise<AdminAiConfigCatalog> {
  return requestAdminJson<{ catalog: AdminAiConfigCatalogResponse }>("/v1/admin/ai-config").then(
    (response) => ({
      providers: response.catalog.providers,
      runtimeTemplates: response.catalog.runtimeTemplates,
      models: response.catalog.models,
      dimensions: response.catalog.dimensions,
      dimensionValues: response.catalog.dimensionValues,
      aiOptions: response.catalog.aiOptions.map(normalizeAdminAiOptionRecord)
    })
  );
}

export async function previewAdminAiOptionGeneration(runtimeTemplateId: string): Promise<AdminAiOptionPreviewItem[]> {
  return requestAdminJson<{ preview: AdminAiOptionPreviewItem[] }>("/v1/admin/ai-config/generate-preview", {
    method: "POST",
    body: JSON.stringify({ runtimeTemplateId })
  }).then((response) => response.preview);
}

export async function applyAdminAiOptionGeneration(
  runtimeTemplateId: string,
  targetNormalizedParameterValues?: Record<string, string>
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
}> {
  return requestAdminJson<{
    result: {
      created: number;
      updated: number;
      skipped: number;
      conflicts: number;
    };
  }>("/v1/admin/ai-config/generate-apply", {
    method: "POST",
    body: JSON.stringify({ runtimeTemplateId, targetNormalizedParameterValues })
  }).then((response) => response.result);
}

export async function updateAdminAiOption(
  optionId: string,
  input: Partial<AdminAiOptionRecord>
): Promise<AdminAiOptionRecord> {
  return requestAdminJson<{ aiOption: AdminAiOptionRecord }>(`/v1/admin/ai-config/options/${optionId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  }).then((response) => normalizeAdminAiOptionRecord(response.aiOption));
}

export async function createAdminAiOption(input: CreateAdminAiOptionInput): Promise<AdminAiOptionRecord> {
  return requestAdminJson<{ aiOption: AdminAiOptionRecord }>("/v1/admin/ai-config/options", {
    method: "POST",
    body: JSON.stringify(input)
  }).then((response) => normalizeAdminAiOptionRecord(response.aiOption));
}

export async function deleteAdminAiOption(optionId: string): Promise<void> {
  await requestAdminJson<{ deleted: boolean }>(`/v1/admin/ai-config/options/${optionId}`, {
    method: "DELETE"
  });
}

export async function createAdminRuntimeTemplate(
  input: CreateAdminRuntimeTemplateInput
): Promise<AdminRuntimeTemplateRecord> {
  return requestAdminJson<{ runtimeTemplate: AdminRuntimeTemplateRecord }>("/v1/admin/ai-config/runtime-templates", {
    method: "POST",
    body: JSON.stringify(input)
  }).then((response) => response.runtimeTemplate);
}

export async function updateAdminRuntimeTemplate(
  runtimeTemplateId: string,
  input: UpdateAdminRuntimeTemplateInput
): Promise<AdminRuntimeTemplateRecord> {
  return requestAdminJson<{ runtimeTemplate: AdminRuntimeTemplateRecord }>(
    `/v1/admin/ai-config/runtime-templates/${runtimeTemplateId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  ).then((response) => response.runtimeTemplate);
}

export async function deleteAdminRuntimeTemplate(runtimeTemplateId: string): Promise<void> {
  await requestAdminJson<{ deleted: boolean }>(`/v1/admin/ai-config/runtime-templates/${runtimeTemplateId}`, {
    method: "DELETE"
  });
}

export async function createAdminProvider(input: CreateAdminProviderInput): Promise<AdminProviderRecord> {
  return requestAdminJson<{ provider: AdminProviderRecord }>("/v1/admin/ai-config/providers", {
    method: "POST",
    body: JSON.stringify(input)
  }).then((response) => response.provider);
}

export async function updateAdminProvider(
  providerId: string,
  input: UpdateAdminProviderInput
): Promise<AdminProviderRecord> {
  return requestAdminJson<{ provider: AdminProviderRecord }>(`/v1/admin/ai-config/providers/${providerId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  }).then((response) => response.provider);
}

export async function deleteAdminProvider(providerId: string): Promise<void> {
  await requestAdminJson<{ deleted: boolean }>(`/v1/admin/ai-config/providers/${providerId}`, {
    method: "DELETE"
  });
}

export async function createAdminModel(input: CreateAdminModelInput): Promise<AdminModelRecord> {
  return requestAdminJson<{ model: AdminModelRecord }>("/v1/admin/ai-config/models", {
    method: "POST",
    body: JSON.stringify(input)
  }).then((response) => response.model);
}

export async function updateAdminModel(modelId: string, input: UpdateAdminModelInput): Promise<AdminModelRecord> {
  return requestAdminJson<{ model: AdminModelRecord }>(`/v1/admin/ai-config/models/${modelId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  }).then((response) => response.model);
}

export async function deleteAdminModel(modelId: string): Promise<void> {
  await requestAdminJson<{ deleted: boolean }>(`/v1/admin/ai-config/models/${modelId}`, {
    method: "DELETE"
  });
}

export interface AdminAiTraceListItem {
  traceId: string;
  userId: string | null;
  deviceId: string | null;
  providerId: string | null;
  providerLabel: string | null;
  resolvedAiOptionId: string | null;
  resolvedModelId: string | null;
  resolvedUpstreamModel: string | null;
  clientRequestModel: string | null;
  requestKind: string | null;
  status: string;
  isStream: boolean;
  startedAt: string;
  endedAt: string | null;
  totalLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AdminAiTraceEventRecord {
  traceId: string;
  seqNo: number;
  stage: string;
  direction: string;
  component: string;
  status: string;
  occurredAt: string;
  latencyMs: number | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  payloadJson: unknown;
  payloadPreviewText: string | null;
  headersJson: unknown;
  metadataJson: unknown;
}

export interface AdminAiTraceDetail extends AdminAiTraceListItem {
  events: AdminAiTraceEventRecord[];
}

export interface AdminAiTracesPage {
  items: AdminAiTraceListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GetAdminAiTracesParams {
  page?: number;
  pageSize?: number;
  status?: string;
  providerId?: string;
  traceId?: string;
}

export async function getAdminAiTraces(params: GetAdminAiTracesParams = {}): Promise<AdminAiTracesPage> {
  const query = new URLSearchParams();
  if (params.page) {
    query.set("page", String(params.page));
  }
  if (params.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.providerId) {
    query.set("providerId", params.providerId);
  }
  if (params.traceId) {
    query.set("traceId", params.traceId);
  }

  const queryString = query.toString();
  return requestAdminJson<AdminAiTracesPage>(`/v1/admin/ai-traces${queryString ? `?${queryString}` : ""}`);
}

export async function getAdminAiTrace(traceId: string): Promise<AdminAiTraceDetail> {
  return requestAdminJson<{ trace: AdminAiTraceDetail }>(`/v1/admin/ai-traces/${traceId}`).then((response) => response.trace);
}

function getAdminAuthorizationHeader(): string {
  const username = process.env.ZEBRAGATE_ADMIN_USERNAME ?? "";
  const password = process.env.ZEBRAGATE_ADMIN_PASSWORD ?? "";

  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function requestAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      authorization: getAdminAuthorizationHeader(),
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as {
      error?: {
        message?: string;
      };
    } | null;

    throw new Error(errorPayload?.error?.message ?? "Admin API request failed.");
  }

  return (await response.json()) as T;
}

function normalizeAdminAiOptionRecord(aiOption: AdminAiOptionRecord): AdminAiOptionRecord {
  return aiOption;
}
