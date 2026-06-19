import type { FastifyPluginAsync } from "fastify";
import {
  getCreditBalance,
  grantDailyCheckin,
  grantRegisterGift,
  listCreditLedger
} from "../../services/credits.js";
import { resolveCurrentUserId } from "../../utils/auth.js";

export const creditsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { batchesLimit?: string } }>("/balance", async (request) => {
    const userId = await resolveCurrentUserId(request);
    const rawLimit = request.query.batchesLimit ? Number(request.query.batchesLimit) : 20;
    const batchesLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    return getCreditBalance(userId, batchesLimit);
  });

  app.get<{ Querystring: { limit?: string } }>("/ledger", async (request) => {
    const userId = await resolveCurrentUserId(request);
    const rawLimit = request.query.limit ? Number(request.query.limit) : 20;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    return {
      ledger: await listCreditLedger(userId, limit)
    };
  });

  app.post("/register-gift", async (request) => {
    const userId = await resolveCurrentUserId(request);
    return grantRegisterGift(userId);
  });

  app.post("/checkin", async (request) => {
    const userId = await resolveCurrentUserId(request);
    return grantDailyCheckin(userId);
  });
};
