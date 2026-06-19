import type { FastifyPluginAsync } from "fastify";
import { getEnvHealth } from "../config/env.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    ok: true,
    config: getEnvHealth()
  }));
};
