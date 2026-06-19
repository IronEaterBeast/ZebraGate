import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.js";
import { adminAiTracesRoutes } from "./routes/v1/admin-ai-traces.js";
import { adminAiConfigRoutes } from "./routes/v1/admin-ai-config.js";
import { aiOptionRoutes } from "./routes/v1/ai-options.js";
import { authRoutes } from "./routes/v1/auth.js";
import { creditsRoutes } from "./routes/v1/credits.js";
import { openAiRoutes } from "./routes/v1/openai.js";
import { openAiTraceEventRoutes } from "./routes/v1/openai-trace-events.js";
import { isZebraGateApiError } from "./utils/errors.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "warn" } });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = (body as string).trim();
    if (text.length === 0) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(text));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (isZebraGateApiError(error)) {
      reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message
        }
      });
      return;
    }

    if (typeof error.statusCode === "number" && error.statusCode < 500) {
      reply.code(error.statusCode).send({
        error: {
          code: error.code ?? "BAD_REQUEST",
          message: error.message
        }
      });
      return;
    }

    app.log.error(error);
    reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error."
      }
    });
  });
  await app.register(healthRoutes);
  await app.register(async (v1) => {
    await v1.register(authRoutes, { prefix: "/v1" });
    await v1.register(aiOptionRoutes, { prefix: "/v1/ai-options" });
    await v1.register(creditsRoutes, { prefix: "/v1/credits" });
    await v1.register(openAiRoutes, { prefix: "/v1/openai" });
    await v1.register(openAiTraceEventRoutes, { prefix: "/v1/openai" });
    await v1.register(adminAiConfigRoutes, { prefix: "/v1/admin/ai-config" });
    await v1.register(adminAiTracesRoutes, { prefix: "/v1/admin/ai-traces" });
  });

  return app;
}
