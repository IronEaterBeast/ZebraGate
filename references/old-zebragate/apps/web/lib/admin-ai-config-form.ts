import type {
  AdminAiOptionRecord,
  CreateAdminAiOptionInput,
  CreateAdminModelInput,
  CreateAdminProviderInput,
  CreateAdminRuntimeTemplateInput,
  UpdateAdminModelInput,
  UpdateAdminProviderInput,
  UpdateAdminRuntimeTemplateInput
} from "./admin-api-client";
import { ADMIN_AI_CONFIG_STATUS_OPTIONS } from "./admin-ai-config-status";
import type { ProviderStatus } from "@zebragate/shared";

export interface ParsedAdminAiOptionFormSubmission {
  optionId: string;
  input: Partial<AdminAiOptionRecord>;
}

export interface ParsedCreateAdminAiOptionFormSubmission {
  input: CreateAdminAiOptionInput | null;
}

export function parseAdminAiOptionFormSubmission(formData: FormData): ParsedAdminAiOptionFormSubmission {
  const optionId = String(formData.get("optionId") ?? "");
  const sortOrderValue = String(formData.get("sortOrder") ?? "");
  const creditMultiplierValue = String(formData.get("creditMultiplier") ?? "");
  const displayConfigSummaryOverridden = formData.has("displayConfigSummaryOverridden");
  const creditMultiplierOverridden = formData.has("creditMultiplierOverridden");
  const actualRequestParametersJson = parseJsonObject(formData.get("actualRequestParametersJson"));
  const input: Partial<AdminAiOptionRecord> = {
    publicName: String(formData.get("publicName") ?? ""),
    displayConfigSummaryOverridden,
    creditMultiplierOverridden,
    isRecommended: formData.has("isRecommended"),
    isPublic: formData.has("isPublic"),
    isEnabled: formData.has("isEnabled"),
    status: toAdminStatus(formData.get("status")),
    healthStatus: toAdminStatus(formData.get("healthStatus")),
    disableReason: toNullableString(formData.get("disableReason"))
  };

  const sortOrder = Number(sortOrderValue);
  if (sortOrderValue.length > 0 && Number.isFinite(sortOrder)) {
    input.sortOrder = sortOrder;
  }

  if (displayConfigSummaryOverridden) {
    input.displayConfigSummary = String(formData.get("displayConfigSummary") ?? "");
  }

  if (creditMultiplierOverridden) {
    const creditMultiplier = Number(creditMultiplierValue);
    if (creditMultiplierValue.length > 0 && Number.isFinite(creditMultiplier)) {
      input.creditMultiplier = creditMultiplier;
    }
  }

  if (actualRequestParametersJson) {
    input.actualRequestParametersJson = actualRequestParametersJson;
  }

  return {
    optionId,
    input
  };
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function toAdminStatus(value: FormDataEntryValue | null): ProviderStatus {
  const status = String(value ?? "").trim();
  return ADMIN_AI_CONFIG_STATUS_OPTIONS.includes(status as (typeof ADMIN_AI_CONFIG_STATUS_OPTIONS)[number])
    ? (status as ProviderStatus)
    : "unknown";
}

export function parseCreateAdminAiOptionFormSubmission(formData: FormData): ParsedCreateAdminAiOptionFormSubmission {
  const modelId = String(formData.get("modelId") ?? "").trim();
  const publicName = String(formData.get("publicName") ?? "").trim();
  const actualRequestParametersJson = parseJsonObject(formData.get("actualRequestParametersJson"));
  const displayConfigSummaryOverridden = formData.has("displayConfigSummaryOverridden");
  const creditMultiplierOverridden = formData.has("creditMultiplierOverridden");
  const creditMultiplierValue = String(formData.get("creditMultiplier") ?? "");

  if (!modelId || !publicName || !actualRequestParametersJson) {
    return {
      input: null
    };
  }

  const input: CreateAdminAiOptionInput = {
    modelId,
    publicName,
    actualRequestParametersJson,
    displayConfigSummaryOverridden,
    creditMultiplierOverridden,
    status: toAdminStatus(formData.get("status")),
    healthStatus: toAdminStatus(formData.get("healthStatus")),
    isRecommended: formData.has("isRecommended"),
    isPublic: formData.has("isPublic"),
    isEnabled: formData.has("isEnabled")
  };

  if (displayConfigSummaryOverridden) {
    input.displayConfigSummary = String(formData.get("displayConfigSummary") ?? "");
  }

  if (creditMultiplierOverridden) {
    const creditMultiplier = Number(creditMultiplierValue);
    if (creditMultiplierValue.length > 0 && Number.isFinite(creditMultiplier)) {
      input.creditMultiplier = creditMultiplier;
    }
  }

  return {
    input
  };
}

export interface ParsedCreateAdminProviderFormSubmission {
  input: CreateAdminProviderInput | null;
}

export interface ParsedCreateAdminRuntimeTemplateFormSubmission {
  input: CreateAdminRuntimeTemplateInput | null;
  errors: string[];
}

export interface ParsedUpdateAdminRuntimeTemplateFormSubmission {
  runtimeTemplateId: string;
  input: UpdateAdminRuntimeTemplateInput;
}

export interface ParsedUpdateAdminProviderFormSubmission {
  providerId: string;
  input: UpdateAdminProviderInput;
}

export function parseCreateAdminProviderFormSubmission(formData: FormData): ParsedCreateAdminProviderFormSubmission {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const providerLabel = String(formData.get("providerLabel") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (!displayName || !providerLabel || !baseUrl) {
    return {
      input: null
    };
  }

  const input: CreateAdminProviderInput = {
    displayName,
    providerLabel,
    baseUrl,
    status: toAdminStatus(formData.get("status")),
    healthStatus: toAdminStatus(formData.get("healthStatus")),
    isEnabled: formData.has("isEnabled")
  };

  if (apiKey) {
    input.apiKey = apiKey;
  }

  return {
    input
  };
}

function parseJsonObject(value: FormDataEntryValue | null): Record<string, unknown> | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseJsonValue(value: FormDataEntryValue | null): unknown | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function parseCreateAdminRuntimeTemplateFormSubmission(
  formData: FormData
): ParsedCreateAdminRuntimeTemplateFormSubmission {
  const templateKey = String(formData.get("templateKey") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const parameterSchemaJson = parseJsonValue(formData.get("parameterSchemaJson"));

  const errors: string[] = [];
  if (!templateKey) {
    errors.push("模板 Key 为必填项。");
  }
  if (!name) {
    errors.push("模板名称为必填项。");
  }
  if (parameterSchemaJson === null) {
    errors.push("参数结构 JSON 不是合法的 JSON，请检查格式（如多余的逗号、未闭合的括号或引号）。");
  }

  if (errors.length > 0) {
    return {
      input: null,
      errors
    };
  }

  return {
    input: {
      templateKey,
      name,
      description: toNullableString(formData.get("description")),
      parameterSchemaJson,
      isEnabled: formData.has("isEnabled"),
      adminNote: toNullableString(formData.get("adminNote"))
    },
    errors: []
  };
}

export function parseUpdateAdminRuntimeTemplateFormSubmission(
  formData: FormData
): ParsedUpdateAdminRuntimeTemplateFormSubmission {
  const runtimeTemplateId = String(formData.get("runtimeTemplateId") ?? "").trim();
  const parameterSchemaJson = parseJsonValue(formData.get("parameterSchemaJson"));
  const input: UpdateAdminRuntimeTemplateInput = {
    templateKey: String(formData.get("templateKey") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: toNullableString(formData.get("description")),
    isEnabled: formData.has("isEnabled"),
    adminNote: toNullableString(formData.get("adminNote"))
  };

  if (parameterSchemaJson !== null) {
    input.parameterSchemaJson = parameterSchemaJson;
  }

  return {
    runtimeTemplateId,
    input
  };
}

export interface ParsedCreateAdminModelFormSubmission {
  input: CreateAdminModelInput | null;
}

export interface ParsedUpdateAdminModelFormSubmission {
  modelId: string;
  input: UpdateAdminModelInput;
}

export function parseCreateAdminModelFormSubmission(formData: FormData): ParsedCreateAdminModelFormSubmission {
  const providerId = String(formData.get("providerId") ?? "").trim();
  const runtimeTemplateId = String(formData.get("runtimeTemplateId") ?? "").trim();
  const modelKey = String(formData.get("modelKey") ?? "").trim();
  const modelLabel = String(formData.get("modelLabel") ?? "").trim();
  const upstreamModel = String(formData.get("upstreamModel") ?? "").trim();
  const baseCreditMultiplierValue = String(formData.get("baseCreditMultiplier") ?? "");
  const sortOrderValue = String(formData.get("sortOrder") ?? "");

  if (!providerId || !modelKey || !modelLabel || !upstreamModel) {
    return {
      input: null
    };
  }

  const input: CreateAdminModelInput = {
    providerId,
    runtimeTemplateId: runtimeTemplateId || null,
    modelKey,
    modelLabel,
    upstreamModel,
    status: toAdminStatus(formData.get("status")),
    isEnabled: formData.has("isEnabled")
  };

  const baseCreditMultiplier = Number(baseCreditMultiplierValue);
  if (baseCreditMultiplierValue.length > 0 && Number.isFinite(baseCreditMultiplier)) {
    input.baseCreditMultiplier = baseCreditMultiplier;
  }

  const sortOrder = Number(sortOrderValue);
  if (sortOrderValue.length > 0 && Number.isFinite(sortOrder)) {
    input.sortOrder = sortOrder;
  }

  return {
    input
  };
}

export function parseUpdateAdminModelFormSubmission(formData: FormData): ParsedUpdateAdminModelFormSubmission {
  const modelId = String(formData.get("modelId") ?? "");
  const runtimeTemplateId = String(formData.get("runtimeTemplateId") ?? "").trim();
  const baseCreditMultiplierValue = String(formData.get("baseCreditMultiplier") ?? "");
  const sortOrderValue = String(formData.get("sortOrder") ?? "");

  const input: UpdateAdminModelInput = {
    runtimeTemplateId: runtimeTemplateId || null,
    modelKey: String(formData.get("modelKey") ?? ""),
    modelLabel: String(formData.get("modelLabel") ?? ""),
    upstreamModel: String(formData.get("upstreamModel") ?? ""),
    status: toAdminStatus(formData.get("status")),
    isEnabled: formData.has("isEnabled")
  };

  const baseCreditMultiplier = Number(baseCreditMultiplierValue);
  if (baseCreditMultiplierValue.length > 0 && Number.isFinite(baseCreditMultiplier)) {
    input.baseCreditMultiplier = baseCreditMultiplier;
  }

  const sortOrder = Number(sortOrderValue);
  if (sortOrderValue.length > 0 && Number.isFinite(sortOrder)) {
    input.sortOrder = sortOrder;
  }

  return {
    modelId,
    input
  };
}

export function parseUpdateAdminProviderFormSubmission(formData: FormData): ParsedUpdateAdminProviderFormSubmission {
  const providerId = String(formData.get("providerId") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();

  const input: UpdateAdminProviderInput = {
    displayName: String(formData.get("displayName") ?? ""),
    providerLabel: String(formData.get("providerLabel") ?? ""),
    status: toAdminStatus(formData.get("status")),
    healthStatus: toAdminStatus(formData.get("healthStatus")),
    isEnabled: formData.has("isEnabled"),
    disableReason: toNullableString(formData.get("disableReason"))
  };

  if (baseUrl) {
    input.baseUrl = baseUrl;
  }

  if (apiKey) {
    input.apiKey = apiKey;
  }

  return {
    providerId,
    input
  };
}
