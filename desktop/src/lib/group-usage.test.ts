import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import { formatGroupLastUsedAt } from "./group-usage";

const translate = i18n.getFixedT(null, null);

describe("formatGroupLastUsedAt", () => {
  it("formats empty and concrete last-used values", () => {
    expect(formatGroupLastUsedAt(translate, null)).toBe("从未使用");
    expect(formatGroupLastUsedAt(translate, 1_800_000_000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
