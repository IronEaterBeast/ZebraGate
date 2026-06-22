import { describe, expect, it } from "vitest";
import zhCN from "./locales/zh-CN.json";

// 把嵌套语言包拍平成「点号路径 -> 文案」对，便于逐条断言。
function flattenLocale(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") {
    return [[prefix, value]];
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([childKey, childValue]) =>
      flattenLocale(childValue, prefix ? `${prefix}.${childKey}` : childKey)
    );
  }
  return [];
}

const CJK_PATTERN = /[一-鿿]/;

// 合法地不含中文的文案：品牌名、纯符号分隔符、占位符/标点等。
// 这些是「按设计就不该被翻译」的值，而非漏翻的源语言英文。
const NON_CHINESE_BY_DESIGN = new Set<string>([
  "home.appName" // 品牌名 ZebraGate，所有语言下保持一致
]);

// 仅由插值占位符 + 标点/空白构成、不含任何字母单词的值（如 "{{name}}：{{count}}"）
// 同样不需要包含中文。用「去掉占位符后是否还剩拉丁字母」来判断是否藏着英文单词。
function hasLatinWordOutsidePlaceholders(value: string): boolean {
  const withoutPlaceholders = value.replace(/\{\{[^}]*\}\}/g, "");
  return /[A-Za-z]/.test(withoutPlaceholders);
}

describe("zh-CN 语言包完整性", () => {
  const entries = flattenLocale(zhCN);

  it("不应为空", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  // 默认且当前唯一语言是 zh-CN。回归守护：防止后续编辑把源语言英文文案
  // （如 "Sign In" / "Credits:" / "Loading..."）留在唯一发布语言包里——
  // check-i18n 只查「代码里的裸中文」，查不到「语言包里漏翻的英文」。
  it.each(entries)("「%s」应是面向用户的中文文案，而非未翻译的英文", (key, value) => {
    if (NON_CHINESE_BY_DESIGN.has(key)) {
      return;
    }

    if (hasLatinWordOutsidePlaceholders(value)) {
      // 文案里出现了占位符之外的拉丁字母单词。允许「中文里夹带专有名词」
      // （如 "无法连接 ZebraGate API：…"），但要求整体仍含中文，
      // 以排除「整条都是英文」的漏翻。
      expect(value, `「${key}」=「${value}」疑似含未翻译英文`).toMatch(CJK_PATTERN);
    }
  });
});
