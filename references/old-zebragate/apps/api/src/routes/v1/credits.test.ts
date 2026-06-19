import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

const grantRegisterGiftMock = vi.fn();
const grantDailyCheckinMock = vi.fn();

vi.mock("../../services/credits.js", () => ({
  getCreditBalance: vi.fn(),
  grantRegisterGift: grantRegisterGiftMock,
  grantDailyCheckin: grantDailyCheckinMock,
  listCreditLedger: vi.fn()
}));

vi.mock("../../utils/auth.js", () => ({
  resolveCurrentUserId: vi.fn().mockResolvedValue("user-1")
}));

const { creditsRoutes } = await import("./credits.js");

function buildTestApp() {
  const app = Fastify();
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
  return app;
}

describe("credits routes", () => {
  it("grants the register gift for a POST request with an empty application/json body, as sent by the web dashboard", async () => {
    grantRegisterGiftMock.mockResolvedValue({
      balance: 500,
      batch: { id: "batch-1" },
      ledgerEntry: { id: "ledger-1" }
    });

    const app = buildTestApp();
    await app.register(creditsRoutes, { prefix: "/v1/credits" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/credits/register-gift",
      headers: { "content-type": "application/json" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      balance: 500,
      batch: { id: "batch-1" },
      ledgerEntry: { id: "ledger-1" }
    });
    expect(grantRegisterGiftMock).toHaveBeenCalledWith("user-1");
  });

  it("grants the daily check-in for a POST request with an empty application/json body", async () => {
    grantDailyCheckinMock.mockResolvedValue({
      balance: 510,
      batch: { id: "batch-2" },
      ledgerEntry: { id: "ledger-2" }
    });

    const app = buildTestApp();
    await app.register(creditsRoutes, { prefix: "/v1/credits" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/credits/checkin",
      headers: { "content-type": "application/json" }
    });

    expect(response.statusCode).toBe(200);
    expect(grantDailyCheckinMock).toHaveBeenCalledWith("user-1");
  });
});
