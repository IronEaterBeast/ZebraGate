import { getSupabaseAdminClient } from "./supabase.js";
import { ZebraGateApiError } from "../utils/errors.js";

export type AiTraceStage =
  | "desktop_inbound"
  | "desktop_to_server"
  | "server_to_ai"
  | "ai_to_server"
  | "server_to_desktop"
  | "desktop_to_client";

export type AiTraceDirection = "inbound" | "outbound" | "internal";

export type AiTraceComponent = "desktop" | "api" | "upstream_ai";

export type AiTraceEventStatus =
  | "started"
  | "success"
  | "error"
  | "blocked"
  | "streaming"
  | "finished"
  | "cancelled";

export interface CreateAiTraceEventInput {
  traceId: string;
  userId: string | null;
  deviceId?: string | null;
  desktopInstanceId?: string | null;
  entrypoint?: string | null;
  requestKind?: string | null;
  clientRequestModel?: string | null;
  resolvedAiOptionId?: string | null;
  resolvedModelId?: string | null;
  resolvedUpstreamModel?: string | null;
  providerId?: string | null;
  isStream?: boolean | null;
  stage: AiTraceStage;
  direction: AiTraceDirection;
  component: AiTraceComponent;
  status: AiTraceEventStatus;
  occurredAt?: string;
  latencyMs?: number | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payloadJson?: unknown;
  payloadPreviewText?: string | null;
  headersJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

export interface AiTraceRepository {
  appendEvent(input: CreateAiTraceEventInput): Promise<void>;
}

const TERMINAL_TRACE_STATUSES = new Set<AiTraceEventStatus>(["success", "error", "blocked", "finished", "cancelled"]);

export function createSupabaseAiTraceRepository(): AiTraceRepository {
  return {
    async appendEvent(input: CreateAiTraceEventInput): Promise<void> {
      const client = getSupabaseAdminClient();
      const occurredAt = input.occurredAt ?? new Date().toISOString();

      const [{ data: existingTrace, error: traceError }, { data: latestEvent, error: latestEventError }] =
        await Promise.all([
          client
            .from("ai_call_traces")
            .select("trace_id, started_at")
            .eq("trace_id", input.traceId)
            .maybeSingle(),
          client
            .from("ai_call_trace_events")
            .select("seq_no")
            .eq("trace_id", input.traceId)
            .order("seq_no", { ascending: false })
            .limit(1)
            .maybeSingle()
        ]);

      if (traceError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", traceError.message, 500);
      }

      if (latestEventError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", latestEventError.message, 500);
      }

      const normalizedStatus = normalizeTraceStatus(input.status);
      const traceStartedAt = (existingTrace as { started_at?: string } | null)?.started_at ?? occurredAt;
      const totalLatencyMs = TERMINAL_TRACE_STATUSES.has(input.status)
        ? Math.max(0, new Date(occurredAt).getTime() - new Date(traceStartedAt).getTime())
        : null;

      if (!existingTrace) {
        const { error } = await client.from("ai_call_traces").insert({
          trace_id: input.traceId,
          user_id: input.userId,
          device_id: input.deviceId ?? null,
          desktop_instance_id: input.desktopInstanceId ?? null,
          entrypoint: input.entrypoint ?? null,
          request_kind: input.requestKind ?? null,
          client_request_model: input.clientRequestModel ?? null,
          resolved_ai_option_id: input.resolvedAiOptionId ?? null,
          resolved_model_id: input.resolvedModelId ?? null,
          resolved_upstream_model: input.resolvedUpstreamModel ?? null,
          provider_id: input.providerId ?? null,
          is_stream: input.isStream ?? false,
          status: normalizedStatus,
          started_at: occurredAt,
          ended_at: totalLatencyMs === null ? null : occurredAt,
          total_latency_ms: totalLatencyMs,
          input_tokens: input.inputTokens ?? null,
          output_tokens: input.outputTokens ?? null,
          total_tokens: input.totalTokens ?? null,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          updated_at: occurredAt
        });

        if (error) {
          throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
        }
      } else {
        const updatePayload = {
          user_id: input.userId ?? undefined,
          device_id: input.deviceId ?? undefined,
          desktop_instance_id: input.desktopInstanceId ?? undefined,
          entrypoint: input.entrypoint ?? undefined,
          request_kind: input.requestKind ?? undefined,
          client_request_model: input.clientRequestModel ?? undefined,
          resolved_ai_option_id: input.resolvedAiOptionId ?? undefined,
          resolved_model_id: input.resolvedModelId ?? undefined,
          resolved_upstream_model: input.resolvedUpstreamModel ?? undefined,
          provider_id: input.providerId ?? undefined,
          is_stream: input.isStream ?? undefined,
          status: normalizedStatus,
          ended_at: totalLatencyMs === null ? undefined : occurredAt,
          total_latency_ms: totalLatencyMs ?? undefined,
          input_tokens: input.inputTokens ?? undefined,
          output_tokens: input.outputTokens ?? undefined,
          total_tokens: input.totalTokens ?? undefined,
          error_code: input.errorCode ?? undefined,
          error_message: input.errorMessage ?? undefined,
          updated_at: occurredAt
        };

        const { error } = await client
          .from("ai_call_traces")
          .update(removeUndefinedValues(updatePayload))
          .eq("trace_id", input.traceId);

        if (error) {
          throw new ZebraGateApiError("INTERNAL_ERROR", error.message, 500);
        }
      }

      const nextSeqNo = ((latestEvent as { seq_no?: number } | null)?.seq_no ?? 0) + 1;
      const { error: insertError } = await client.from("ai_call_trace_events").insert({
        trace_id: input.traceId,
        seq_no: nextSeqNo,
        stage: input.stage,
        direction: input.direction,
        component: input.component,
        status: input.status,
        occurred_at: occurredAt,
        latency_ms: input.latencyMs ?? null,
        http_status: input.httpStatus ?? null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        payload_json: input.payloadJson ?? null,
        payload_preview_text: input.payloadPreviewText ?? null,
        headers_json: input.headersJson ?? {},
        metadata_json: input.metadataJson ?? {}
      });

      if (insertError) {
        throw new ZebraGateApiError("INTERNAL_ERROR", insertError.message, 500);
      }
    }
  };
}

function normalizeTraceStatus(status: AiTraceEventStatus): string {
  return status === "finished" ? "success" : status;
}

function removeUndefinedValues<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
