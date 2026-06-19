export interface DatabaseTimestamps {
  created_at: string;
  updated_at?: string | null;
}

export interface ProfileRow extends DatabaseTimestamps {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CreditBatchRow extends DatabaseTimestamps {
  id: string;
  user_id: string;
  source_type: string;
  original_credits: number;
  remaining_credits: number;
  expires_at: string | null;
}

export interface CreditLedgerRow extends DatabaseTimestamps {
  id: string;
  user_id: string;
  batch_id: string | null;
  amount: number;
  balance_after: number;
  type: string;
  source_type: string | null;
  request_id: string | null;
  metadata: unknown;
}

export interface AiProviderRow extends DatabaseTimestamps {
  id: string;
  display_name: string;
  provider_label: string;
  base_url: string;
  api_key_encrypted: string | null;
  default_headers: unknown;
  default_query_params: unknown;
  model: string;
  credit_multiplier: number;
  status: string;
  is_enabled: boolean;
  admin_note: string | null;
  migration_note: string | null;
  health_status: string;
  disable_reason: string | null;
}

export interface AiModelRow extends DatabaseTimestamps {
  id: string;
  provider_id: string;
  runtime_template_id: string | null;
  model_key: string;
  model_label: string;
  upstream_model: string;
  base_credit_multiplier: number;
  status: string;
  is_enabled: boolean;
  sort_order: number;
  admin_note: string | null;
  migration_note: string | null;
}

export interface AiRuntimeTemplateRow extends DatabaseTimestamps {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  parameter_schema_json: unknown;
  is_enabled: boolean;
  admin_note: string | null;
  migration_note: string | null;
}

export interface AiModelDimensionRow extends DatabaseTimestamps {
  id: string;
  model_id: string;
  dimension_key: string;
  label: string;
  sort_order: number;
  is_enabled: boolean;
  admin_note: string | null;
}

export interface AiModelDimensionValueRow extends DatabaseTimestamps {
  id: string;
  dimension_id: string;
  value_key: string;
  label: string;
  is_default: boolean;
  omit_when_default: boolean;
  include_in_summary: boolean;
  credit_multiplier_delta: number;
  request_parameter_fragment: unknown;
  depends_on: unknown;
  sort_order: number;
  is_enabled: boolean;
  admin_note: string | null;
}

export interface AiRuntimePresetRow extends DatabaseTimestamps {
  id: string;
  model_id: string;
  name: string;
  parameter_values: unknown;
  normalized_parameter_values: unknown;
  request_parameters: unknown;
  has_request_parameter_conflict: boolean;
  conflict_details: unknown;
  status: string;
  is_enabled: boolean;
  admin_note: string | null;
  migration_note: string | null;
  generated_by: string;
}

export interface AiOptionRow extends DatabaseTimestamps {
  id: string;
  runtime_preset_id: string | null;
  provider_id: string;
  model_id: string;
  public_name: string;
  generated_config_summary: string;
  display_config_summary: string;
  display_config_summary_overridden: boolean;
  generated_credit_multiplier: number;
  credit_multiplier: number;
  credit_multiplier_overridden: boolean;
  actual_request_parameters_json: unknown;
  display_badges: unknown;
  is_recommended: boolean;
  is_public: boolean;
  is_enabled: boolean;
  status: string;
  health_status: string;
  disable_reason: string | null;
  sort_order: number;
  admin_note: string | null;
  migration_note: string | null;
  generated_by: string;
}

export interface AiOptionPublicCatalogRow {
  ai_option_id: string;
  provider_label: string;
  model_label: string;
  public_name: string;
  display_config_summary: string;
  display_badges: unknown;
  credit_multiplier: number;
  is_recommended: boolean;
  status: string;
  disable_reason: string | null;
  sort_order: number;
  is_public: boolean;
  is_enabled: boolean;
}

export interface UserAiSelectionRow extends DatabaseTimestamps {
  id: string;
  user_id: string;
  provider_id: string;
}

export interface ApiRequestLogRow {
  id: string;
  user_id: string | null;
  provider_id: string | null;
  ai_option_id: string | null;
  runtime_preset_id: string | null;
  model_id: string | null;
  status: string;
  is_stream: boolean;
  credits_used: number;
  latency_ms: number;
  error_code: string | null;
  retry_trace: unknown;
  metadata: unknown;
  request_payload: unknown;
  response_payload: unknown;
  error_message: string | null;
  created_at: string;
}

export interface AbuseRiskEventRow {
  id: string;
  user_id: string | null;
  ip_hash: string | null;
  device_id: string | null;
  event_type: string;
  metadata: unknown;
  created_at: string;
}

export interface AiCallTraceRow extends DatabaseTimestamps {
  id: string;
  trace_id: string;
  user_id: string | null;
  device_id: string | null;
  desktop_instance_id: string | null;
  entrypoint: string | null;
  request_kind: string | null;
  client_request_model: string | null;
  resolved_ai_option_id: string | null;
  resolved_model_id: string | null;
  resolved_upstream_model: string | null;
  provider_id: string | null;
  is_stream: boolean;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  error_code: string | null;
  error_message: string | null;
}

export interface AiCallTraceEventRow {
  id: string;
  trace_id: string;
  seq_no: number;
  stage: string;
  direction: string;
  component: string;
  status: string;
  occurred_at: string;
  latency_ms: number | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  payload_json: unknown;
  payload_preview_text: string | null;
  headers_json: unknown;
  metadata_json: unknown;
  created_at: string;
}
