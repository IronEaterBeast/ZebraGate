import type { AiCallTraceEventRow, AiCallTraceRow } from "@zebragate/db";
import { getSupabaseAdminClient } from "./supabase.js";
import { ZebraGateApiError } from "../utils/errors.js";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

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

export interface ListAdminAiTracesInput {
  page?: number;
  pageSize?: number;
  status?: string;
  providerId?: string;
  traceId?: string;
}

export interface ListAdminAiTracesResult {
  items: AdminAiTraceListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminAiTracesRepository {
  list(input: ListAdminAiTracesInput): Promise<ListAdminAiTracesResult>;
  getByTraceId(traceId: string): Promise<AdminAiTraceDetail | null>;
}

export function createSupabaseAdminAiTracesRepository(): AdminAiTracesRepository {
  return {
    async list(input: ListAdminAiTracesInput): Promise<ListAdminAiTracesResult> {
      const page = Math.max(1, input.page ?? 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const client = getSupabaseAdminClient();
      let query = client
        .from("ai_call_traces")
        .select(
          `
            trace_id,
            user_id,
            device_id,
            provider_id,
            resolved_ai_option_id,
            resolved_model_id,
            resolved_upstream_model,
            client_request_model,
            request_kind,
            status,
            is_stream,
            started_at,
            ended_at,
            total_latency_ms,
            input_tokens,
            output_tokens,
            total_tokens,
            error_code,
            error_message,
            ai_providers ( provider_label )
          `,
          { count: "exact" }
        )
        .order("started_at", { ascending: false })
        .range(from, to);

      if (input.status) {
        query = query.eq("status", input.status);
      }

      if (input.providerId) {
        query = query.eq("provider_id", input.providerId);
      }

      if (input.traceId) {
        query = query.eq("trace_id", input.traceId);
      }

      const { data, error, count } = await query;
      if (error) {
        throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
      }

      const rows = (data ?? []) as Array<
        Pick<
          AiCallTraceRow,
          | "trace_id"
          | "user_id"
          | "device_id"
          | "provider_id"
          | "resolved_ai_option_id"
          | "resolved_model_id"
          | "resolved_upstream_model"
          | "client_request_model"
          | "request_kind"
          | "status"
          | "is_stream"
          | "started_at"
          | "ended_at"
          | "total_latency_ms"
          | "input_tokens"
          | "output_tokens"
          | "total_tokens"
          | "error_code"
          | "error_message"
        > & { ai_providers: { provider_label: string } | { provider_label: string }[] | null }
      >;

      return {
        items: rows.map(toAdminAiTraceListItem),
        page,
        pageSize,
        total: count ?? 0
      };
    },

    async getByTraceId(traceId: string): Promise<AdminAiTraceDetail | null> {
      const client = getSupabaseAdminClient();
      const [{ data: traceData, error: traceError }, { data: eventData, error: eventError }] = await Promise.all([
        client
          .from("ai_call_traces")
          .select(
            `
              trace_id,
              user_id,
              device_id,
              provider_id,
              resolved_ai_option_id,
              resolved_model_id,
              resolved_upstream_model,
              client_request_model,
              request_kind,
              status,
              is_stream,
              started_at,
              ended_at,
              total_latency_ms,
              input_tokens,
              output_tokens,
              total_tokens,
              error_code,
              error_message,
              ai_providers ( provider_label )
            `
          )
          .eq("trace_id", traceId)
          .maybeSingle(),
        client
          .from("ai_call_trace_events")
          .select(
            `
              trace_id,
              seq_no,
              stage,
              direction,
              component,
              status,
              occurred_at,
              latency_ms,
              http_status,
              error_code,
              error_message,
              payload_json,
              payload_preview_text,
              headers_json,
              metadata_json
            `
          )
          .eq("trace_id", traceId)
          .order("seq_no", { ascending: true })
      ]);

      if (traceError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", traceError.message, 500);
      }

      if (eventError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", eventError.message, 500);
      }

      if (!traceData) {
        return null;
      }

      const traceRow = traceData as Pick<
        AiCallTraceRow,
        | "trace_id"
        | "user_id"
        | "device_id"
        | "provider_id"
        | "resolved_ai_option_id"
        | "resolved_model_id"
        | "resolved_upstream_model"
        | "client_request_model"
        | "request_kind"
        | "status"
        | "is_stream"
        | "started_at"
        | "ended_at"
        | "total_latency_ms"
        | "input_tokens"
        | "output_tokens"
        | "total_tokens"
        | "error_code"
        | "error_message"
      > & { ai_providers: { provider_label: string } | { provider_label: string }[] | null };

      return {
        ...toAdminAiTraceListItem(traceRow),
        events: ((eventData ?? []) as AiCallTraceEventRow[]).map(toAdminAiTraceEventRecord)
      };
    }
  };
}

function toAdminAiTraceListItem(
  row: Pick<
    AiCallTraceRow,
    | "trace_id"
    | "user_id"
    | "device_id"
    | "provider_id"
    | "resolved_ai_option_id"
    | "resolved_model_id"
    | "resolved_upstream_model"
    | "client_request_model"
    | "request_kind"
    | "status"
    | "is_stream"
    | "started_at"
    | "ended_at"
    | "total_latency_ms"
    | "input_tokens"
    | "output_tokens"
    | "total_tokens"
    | "error_code"
    | "error_message"
  > & { ai_providers: { provider_label: string } | { provider_label: string }[] | null }
): AdminAiTraceListItem {
  const provider = Array.isArray(row.ai_providers) ? row.ai_providers[0] ?? null : row.ai_providers;

  return {
    traceId: row.trace_id,
    userId: row.user_id,
    deviceId: row.device_id,
    providerId: row.provider_id,
    providerLabel: provider?.provider_label ?? null,
    resolvedAiOptionId: row.resolved_ai_option_id,
    resolvedModelId: row.resolved_model_id,
    resolvedUpstreamModel: row.resolved_upstream_model,
    clientRequestModel: row.client_request_model,
    requestKind: row.request_kind,
    status: row.status,
    isStream: row.is_stream,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalLatencyMs: row.total_latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    errorCode: row.error_code,
    errorMessage: row.error_message
  };
}

function toAdminAiTraceEventRecord(row: AiCallTraceEventRow): AdminAiTraceEventRecord {
  return {
    traceId: row.trace_id,
    seqNo: row.seq_no,
    stage: row.stage,
    direction: row.direction,
    component: row.component,
    status: row.status,
    occurredAt: row.occurred_at,
    latencyMs: row.latency_ms,
    httpStatus: row.http_status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    payloadJson: row.payload_json,
    payloadPreviewText: row.payload_preview_text,
    headersJson: row.headers_json,
    metadataJson: row.metadata_json
  };
}
