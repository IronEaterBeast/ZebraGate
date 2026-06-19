import type { FastifyPluginAsync } from "fastify";
import {
  createSupabasePublicAiOptionRepository,
  listPublicAiOptions,
  type PublicAiOptionRepository
} from "../../services/ai-options.js";

export interface AiOptionRoutesOptions {
  repository?: PublicAiOptionRepository;
}

export const aiOptionRoutes: FastifyPluginAsync<AiOptionRoutesOptions> = async (app, options) => {
  const repository = options.repository ?? createSupabasePublicAiOptionRepository();

  app.get<{ Querystring: { recommendedOnly?: string | boolean } }>("/", async (request) => ({
    aiOptions: await listPublicAiOptions(
      {
        recommendedOnly: parseRecommendedOnly(request.query.recommendedOnly)
      },
      repository
    )
  }));
};

function parseRecommendedOnly(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return true;
}
