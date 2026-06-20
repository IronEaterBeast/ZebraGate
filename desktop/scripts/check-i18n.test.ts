import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

// 通过子进程运行 check-i18n.mjs 对临时目录的探针文件做集成式验证。
const SCRIPT = join(process.cwd(), "scripts", "check-i18n.mjs");

function runCheckOn(files: Record<string, string>): { code: number; output: string } {
  const root = mkdtempSync(join(tmpdir(), "i18n-check-"));
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(srcDir, name), content, "utf8");
  }
  try {
    const output = execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, I18N_CHECK_SRC_DIR: srcDir },
      encoding: "utf8"
    });
    return { code: 0, output };
  } catch (error: any) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("check-i18n script", () => {
  it("passes when no bare Chinese exists", () => {
    const result = runCheckOn({ "clean.tsx": 'export const x = t("home.title");\n' });
    expect(result.code).toBe(0);
  });

  it("fails on a bare Chinese string literal", () => {
    const result = runCheckOn({ "dirty.ts": 'export const x = "裸中文";\n' });
    expect(result.code).toBe(1);
    expect(result.output).toContain("dirty.ts");
  });

  it("fails on bare Chinese in JSX text nodes", () => {
    const result = runCheckOn({ "jsx.tsx": "export const A = () => <span>裸中文</span>;\n" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("jsx.tsx");
  });

  it("fails on bare Chinese inside a multi-line template literal", () => {
    const result = runCheckOn({ "tpl.ts": "export const t = `line1\n第二行中文`;\n" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("tpl.ts");
  });

  it("fails on Chinese after // inside a string (not a real comment)", () => {
    const result = runCheckOn({ "url.ts": 'export const u = "https://example.com/裸中文";\n' });
    expect(result.code).toBe(1);
    expect(result.output).toContain("url.ts");
  });

  it("fails on Chinese inside a string that looks like a block comment", () => {
    const result = runCheckOn({ "fake.ts": 'export const s = "/* 裸中文 */";\n' });
    expect(result.code).toBe(1);
    expect(result.output).toContain("fake.ts");
  });

  it("ignores Chinese inside line comments", () => {
    const result = runCheckOn({ "line.ts": "// 行注释中文\nexport const x = 1;\n" });
    expect(result.code).toBe(0);
  });

  it("ignores Chinese inside multi-line block comments", () => {
    const result = runCheckOn({ "block.ts": "/* 块注释\n   多行中文 */\nexport const x = 1;\n" });
    expect(result.code).toBe(0);
  });

  it("does not misread an apostrophe in JSX text as a string start", () => {
    // <span>don't</span>; // 中文注释 —— 撇号不应被当作字符串起点，
    // 否则行尾的注释会被错判为字符串内中文而误报。
    const apostrophe = String.fromCharCode(39);
    const content = `export const A = () => <span>don${apostrophe}t</span>; // 中文注释\n`;
    const result = runCheckOn({ "apos.tsx": content });
    expect(result.code).toBe(0);
  });

  it("fails on Chinese inside a regular expression literal", () => {
    // 正则里的 // 不是注释，其中的中文应被检出。
    const result = runCheckOn({ "regex.ts": "export const re = /[ab]中文/;\n" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("regex.ts");
  });
});
