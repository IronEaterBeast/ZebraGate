import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import type { OpenAICompatibleChatRequest } from "@zebragate/shared";
import { createSupabaseAiTraceRepository, type AiTraceRepository } from "../../services/ai-traces.js";
import { createDefaultOpenAiGatewayService, type OpenAiGatewaySuccessResult } from "../../services/openai-gateway.js";
import { createSseStreamSummaryAccumulator, summarizeSseStreamSummaryForTrace } from "../../services/sse-stream-summary.js";
import { resolveCurrentUserId } from "../../utils/auth.js";
import { isZebraGateApiError } from "../../utils/errors.js";
import { endSse, setupSse, writeSseChunk, writeSseRawChunk } from "../../utils/sse.js";

export function createOpenAiRoutes(
  gatewayService: {
    handleChatCompletion(context: {
      userId: string;
      ip?: string;
      deviceId?: string;
      traceId?: string;
      request: OpenAICompatibleChatRequest;
    }): Promise<OpenAiGatewaySuccessResult>;
  } = createDefaultOpenAiGatewayService(),
  traceRepository: AiTraceRepository = createSupabaseAiTraceRepository()
): FastifyPluginAsync {
  const openAiRoutes: FastifyPluginAsync = async (app) => {
    app.post<{ Body: OpenAICompatibleChatRequest }>("/chat/completions", async (request, reply) => {
      const userId = await resolveCurrentUserId(request);
      const deviceId = request.headers["x-device-id"]?.toString();
      const traceId = request.headers["x-zebragate-trace-id"]?.toString() ?? randomUUID();
      reply.header("x-zebragate-trace-id", traceId);

      let result: OpenAiGatewaySuccessResult;

      try {
        result = await gatewayService.handleChatCompletion({
          userId,
          ip: request.ip,
          deviceId,
          traceId,
          request: request.body
        });
      } catch (error) {
        await safeRecordTraceEvent(traceRepository, {
          traceId,
          userId,
          deviceId: deviceId ?? null,
          entrypoint: "desktop_local_proxy",
          requestKind: "chat.completions",
          clientRequestModel: request.body.model,
          isStream: Boolean(request.body.stream),
          stage: "server_to_desktop",
          direction: "outbound",
          component: "api",
          status: "error",
          httpStatus: getErrorStatusCode(error),
          errorCode: isZebraGateApiError(error) ? error.code : "INTERNAL_ERROR",
          errorMessage: error instanceof Error ? error.message : "Unknown server error",
          metadataJson: {
            requestKind: "chat.completions"
          }
        });
        throw error;
      }

      if (result.stream) {
        await safeRecordTraceEvent(traceRepository, {
          traceId,
          userId,
          deviceId: deviceId ?? null,
          entrypoint: "desktop_local_proxy",
          requestKind: "chat.completions",
          clientRequestModel: request.body.model,
          isStream: true,
          stage: "server_to_desktop",
          direction: "outbound",
          component: "api",
          status: "streaming",
          httpStatus: 200,
          metadataJson: {
            requestId: result.requestId,
            providerId: result.providerId
          }
        });
        setupSse(reply);
        if (result.streamBody) {
          const reader = result.streamBody.getReader();
          const summaryAccumulator = createSseStreamSummaryAccumulator();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }

              summaryAccumulator.push(value);
              writeSseRawChunk(reply, value);
            }
          } finally {
            reader.releaseLock();
          }

          const sentToDesktopSummary = summaryAccumulator.finish();
          await result.finalizeStream?.();
          await safeRecordTraceEvent(traceRepository, {
            traceId,
            userId,
            deviceId: deviceId ?? null,
            entrypoint: "desktop_local_proxy",
            requestKind: "chat.completions",
            clientRequestModel: request.body.model,
            isStream: true,
            stage: "server_to_desktop",
            direction: "outbound",
            component: "api",
            status: "finished",
            httpStatus: 200,
            payloadJson: { streamSummary: sentToDesktopSummary },
            payloadPreviewText: summarizeSseStreamSummaryForTrace(sentToDesktopSummary, "stream forwarded to desktop"),
            metadataJson: {
              requestId: result.requestId,
              providerId: result.providerId
            }
          });
          reply.raw.end();
          return reply;
        }

        for (const chunk of result.chunks ?? []) {
          writeSseChunk(reply, chunk);
        }
        endSse(reply);
        return reply;
      }

      await safeRecordTraceEvent(traceRepository, {
        traceId,
        userId,
        deviceId: deviceId ?? null,
        entrypoint: "desktop_local_proxy",
        requestKind: "chat.completions",
        clientRequestModel: request.body.model,
        isStream: false,
        stage: "server_to_desktop",
        direction: "outbound",
        component: "api",
        status: "success",
        httpStatus: 200,
        payloadJson: result.completion,
        payloadPreviewText: summarizeJsonForTrace(result.completion),
        metadataJson: {
          requestId: result.requestId,
          providerId: result.providerId
        }
      });
      return result.completion;
    });
  };

  return openAiRoutes;
}

export const openAiRoutes = createOpenAiRoutes();

async function safeRecordTraceEvent(
  traceRepository: AiTraceRepository,
  input: Parameters<AiTraceRepository["appendEvent"]>[0]
): Promise<void> {
  try {
    await traceRepository.appendEvent(input);
  } catch (error) {
    console.error("ZebraGate route trace event write failed.", {
      traceId: input.traceId,
      stage: input.stage,
      status: input.status,
      error: error instanceof Error ? error.message : "Unknown trace write error"
    });
  }
}

function summarizeJsonForTrace(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value).slice(0, 1000);
  } catch {
    return String(value).slice(0, 1000);
  }
}

function getErrorStatusCode(error: unknown): number {
  if (isZebraGateApiError(error)) {
    return error.statusCode;
  }

  return 500;
}
