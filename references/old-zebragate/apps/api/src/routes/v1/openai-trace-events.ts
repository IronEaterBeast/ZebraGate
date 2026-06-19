import type { FastifyPluginAsync } from "fastify";
import { createSupabaseAiTraceRepository, type AiTraceRepository } from "../../services/ai-traces.js";
import { resolveCurrentUserId } from "../../utils/auth.js";

export interface OpenAiTraceEventRoutesOptions {
  repository?: AiTraceRepository;
}

export const openAiTraceEventRoutes: FastifyPluginAsync<OpenAiTraceEventRoutesOptions> = async (app, options) => {
  const repository = options.repository ?? createSupabaseAiTraceRepository();

  app.post<{
    Body: {
      traceId: string;
      stage:
        | "desktop_inbound"
        | "desktop_to_server"
        | "server_to_ai"
        | "ai_to_server"
        | "server_to_desktop"
        | "desktop_to_client";
      direction: "inbound" | "outbound" | "internal";
      component: "desktop" | "api" | "upstream_ai";
      status: "started" | "success" | "error" | "blocked" | "streaming" | "finished" | "cancelled";
      occurredAt?: string;
      entrypoint?: string;
      requestKind?: string;
      clientRequestModel?: string;
      resolvedAiOptionId?: string | null;
      resolvedModelId?: string | null;
      resolvedUpstreamModel?: string | null;
      providerId?: string | null;
      isStream?: boolean;
      latencyMs?: number | null;
      httpStatus?: number | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      payloadJson?: unknown;
      payloadPreviewText?: string | null;
      headersJson?: Record<string, unknown> | null;
      metadataJson?: Record<string, unknown> | null;
    };
  }>("/trace-events", async (request) => {
    const userId = await resolveCurrentUserId(request);
    const deviceId = request.headers["x-device-id"]?.toString() ?? null;

    await repository.appendEvent({
      traceId: request.body.traceId,
      userId,
      deviceId,
      stage: request.body.stage,
      direction: request.body.direction,
      component: request.body.component,
      status: request.body.status,
      occurredAt: request.body.occurredAt,
      entrypoint: request.body.entrypoint,
      requestKind: request.body.requestKind,
      clientRequestModel: request.body.clientRequestModel,
      resolvedAiOptionId: request.body.resolvedAiOptionId ?? null,
      resolvedModelId: request.body.resolvedModelId ?? null,
      resolvedUpstreamModel: request.body.resolvedUpstreamModel ?? null,
      providerId: request.body.providerId ?? null,
      isStream: request.body.isStream,
      latencyMs: request.body.latencyMs ?? null,
      httpStatus: request.body.httpStatus ?? null,
      errorCode: request.body.errorCode ?? null,
      errorMessage: request.body.errorMessage ?? null,
      payloadJson: request.body.payloadJson,
      payloadPreviewText: request.body.payloadPreviewText ?? null,
      headersJson: request.body.headersJson ?? null,
      metadataJson: request.body.metadataJson ?? null
    });

    return { recorded: true };
  });
};
