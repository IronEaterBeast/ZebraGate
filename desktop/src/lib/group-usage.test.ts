import { describe, expect, it } from "vitest";
import { formatGroupLastUsedAt } from "./group-usage";

describe("formatGroupLastUsedAt", () => {
  it("formats empty and concrete last-used values", () => {
    expect(formatGroupLastUsedAt(null)).toBe("从未使用");
    expect(formatGroupLastUsedAt(1_800_000_000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
