import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web dashboard correction", () => {
  it("does not render or call provider selection features", async () => {
    const dashboardPath = resolve(process.cwd(), "../web/app/dashboard/page.tsx");
    const apiClientPath = resolve(process.cwd(), "../web/lib/api-client.ts");
    const [dashboardSource, apiClientSource] = await Promise.all([
      readFile(dashboardPath, "utf8"),
      readFile(apiClientPath, "utf8")
    ]);

    expect(dashboardSource).not.toContain("Provider Selection");
    expect(dashboardSource).not.toContain("Save Selection");
    expect(apiClientSource).not.toContain("/v1/providers/selection");
  });
});
