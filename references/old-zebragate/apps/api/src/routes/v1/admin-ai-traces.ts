import type { FastifyPluginAsync } from "fastify";
import {
  createSupabaseAdminAiTracesRepository,
  type AdminAiTracesRepository
} from "../../services/admin-ai-traces.js";
import { assertAdminAuthenticated } from "../../utils/auth.js";
import { ZebraGateApiError } from "../../utils/errors.js";

export interface AdminAiTracesRoutesOptions {
  repository?: AdminAiTracesRepository;
}

export const adminAiTracesRoutes: FastifyPluginAsync<AdminAiTracesRoutesOptions> = async (app, options) => {
  const repository = options.repository ?? createSupabaseAdminAiTracesRepository();

  app.addHook("preHandler", async (request) => {
    assertAdminAuthenticated(request);
  });

  app.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      status?: string;
      providerId?: string;
      traceId?: string;
    };
  }>("/", async (request) => {
    const { page, pageSize, status, providerId, traceId } = request.query;

    return repository.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      providerId,
      traceId
    });
  });

  app.get<{
    Params: {
      traceId: string;
    };
  }>("/:traceId", async (request) => {
    const item = await repository.getByTraceId(request.params.traceId);
    if (!item) {
      throw new ZebraGateApiError("BAD_REQUEST", "Trace was not found.", 404);
    }

    return { trace: item };
  });
};
