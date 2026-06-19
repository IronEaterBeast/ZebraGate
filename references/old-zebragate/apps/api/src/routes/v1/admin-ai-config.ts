import type { FastifyPluginAsync } from "fastify";
import {
  applyAiOptionGeneration,
  createSupabaseAdminAiConfigRepository,
  normalizeCreateAdminAiOptionInput,
  normalizeCreateAdminModelInput,
  normalizeCreateAdminProviderInput,
  normalizeCreateAdminRuntimeTemplateInput,
  normalizeUpdateAdminAiOptionInput,
  normalizeUpdateAdminModelInput,
  normalizeUpdateAdminProviderInput,
  normalizeUpdateAdminRuntimeTemplateInput,
  previewAiOptionGeneration,
  type AdminAiConfigRepository,
  type CreateAdminAiOptionInput,
  type CreateAdminModelInput,
  type CreateAdminProviderInput,
  type CreateAdminRuntimeTemplateInput,
  type UpdateAdminAiOptionInput,
  type UpdateAdminModelInput,
  type UpdateAdminProviderInput,
  type UpdateAdminRuntimeTemplateInput
} from "../../services/admin-ai-config.js";
import { assertAdminAuthenticated } from "../../utils/auth.js";

export interface AdminAiConfigRoutesOptions {
  repository?: AdminAiConfigRepository;
}

export const adminAiConfigRoutes: FastifyPluginAsync<AdminAiConfigRoutesOptions> = async (
  app,
  options
) => {
  const repository = options.repository ?? createSupabaseAdminAiConfigRepository();

  app.addHook("preHandler", async (request) => {
    assertAdminAuthenticated(request);
  });

  app.get("/", async () => ({
    catalog: await repository.listCatalog()
  }));

  app.post<{ Body: { runtimeTemplateId?: string } }>("/generate-preview", async (request) => {
    const runtimeTemplateId = request.body?.runtimeTemplateId;

    if (!runtimeTemplateId) {
      throw app.httpErrors.badRequest("runtimeTemplateId is required.");
    }

    return {
      preview: await previewAiOptionGeneration(repository, runtimeTemplateId)
    };
  });

  app.post<{
    Body: { runtimeTemplateId?: string; targetNormalizedParameterValues?: Record<string, string> };
  }>("/generate-apply", async (request) => {
    const runtimeTemplateId = request.body?.runtimeTemplateId;

    if (!runtimeTemplateId) {
      throw app.httpErrors.badRequest("runtimeTemplateId is required.");
    }

    return {
      result: await applyAiOptionGeneration(
        repository,
        runtimeTemplateId,
        request.body?.targetNormalizedParameterValues
      )
    };
  });

  app.post<{ Body: CreateAdminAiOptionInput }>("/options", async (request) => ({
    aiOption: await repository.createAiOption(normalizeCreateAdminAiOptionInput(request.body))
  }));

  app.delete<{ Params: { optionId: string } }>("/options/:optionId", async (request) => {
    await repository.deleteAiOption(request.params.optionId);
    return {
      deleted: true
    };
  });

  app.patch<{ Params: { optionId: string }; Body: UpdateAdminAiOptionInput }>(
    "/options/:optionId",
    async (request) => ({
      aiOption: await repository.updateAiOption(
        request.params.optionId,
        normalizeUpdateAdminAiOptionInput(request.body ?? {})
      )
    })
  );

  app.post<{ Body: CreateAdminRuntimeTemplateInput }>("/runtime-templates", async (request) => ({
    runtimeTemplate: await repository.createRuntimeTemplate(normalizeCreateAdminRuntimeTemplateInput(request.body))
  }));

  app.patch<{ Params: { runtimeTemplateId: string }; Body: UpdateAdminRuntimeTemplateInput }>(
    "/runtime-templates/:runtimeTemplateId",
    async (request) => ({
      runtimeTemplate: await repository.updateRuntimeTemplate(
        request.params.runtimeTemplateId,
        normalizeUpdateAdminRuntimeTemplateInput(request.body ?? {})
      )
    })
  );

  app.delete<{ Params: { runtimeTemplateId: string } }>(
    "/runtime-templates/:runtimeTemplateId",
    async (request) => {
      await repository.deleteRuntimeTemplate(request.params.runtimeTemplateId);
      return {
        deleted: true
      };
    }
  );

  app.post<{ Body: CreateAdminProviderInput }>("/providers", async (request) => ({
    provider: await repository.createProvider(normalizeCreateAdminProviderInput(request.body))
  }));

  app.patch<{ Params: { providerId: string }; Body: UpdateAdminProviderInput }>(
    "/providers/:providerId",
    async (request) => ({
      provider: await repository.updateProvider(
        request.params.providerId,
        normalizeUpdateAdminProviderInput(request.body ?? {})
      )
    })
  );

  app.delete<{ Params: { providerId: string } }>("/providers/:providerId", async (request) => {
    await repository.deleteProvider(request.params.providerId);
    return {
      deleted: true
    };
  });

  app.post<{ Body: CreateAdminModelInput }>("/models", async (request) => ({
    model: await repository.createModel(normalizeCreateAdminModelInput(request.body))
  }));

  app.patch<{ Params: { modelId: string }; Body: UpdateAdminModelInput }>(
    "/models/:modelId",
    async (request) => ({
      model: await repository.updateModel(request.params.modelId, normalizeUpdateAdminModelInput(request.body ?? {}))
    })
  );

  app.delete<{ Params: { modelId: string } }>("/models/:modelId", async (request) => {
    await repository.deleteModel(request.params.modelId);
    return {
      deleted: true
    };
  });
};
