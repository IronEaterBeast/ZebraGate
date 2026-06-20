#!/usr/bin/env node
// 兜底检查：用 TypeScript 自带的解析器对 src 下 .ts/.tsx 做语法分析，
// 发现「承载文案的节点中出现中文」即报错退出。
// 目的：防止新增功能时忘记用 i18n 的 t()，把中文文案硬编码进代码。
// 用 TS 解析器而非手写词法，可正确处理字符串/模板/正则/JSX 文本/注释的边界
//（如 JSX 文本里的撇号、正则里的斜杠），避免手写词法的边界误判。
// 注释中的中文允许；语言包 json 与测试文件整体不在检查范围内。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = process.env.I18N_CHECK_SRC_DIR ?? join(here, "..", "src");

const IGNORED = [
  join("i18n", "locales"), // 语言包就是放中文的地方
  ".test.ts",              // 测试文件允许断言中文
  ".test.tsx"
];

const CJK = /[一-鿿]/;

// 这些节点承载面向用户的文案，其中出现中文视为违规。
const TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.JsxText
]);

function listSourceFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      result.push(...listSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      result.push(fullPath);
    }
  }
  return result;
}

function isIgnored(filePath) {
  return IGNORED.some((fragment) => filePath.includes(fragment));
}

function findBareChinese(source) {
  const offending = [];
  const sourceFile = ts.createSourceFile(
    "scan.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );

  const reportedLines = new Set();
  function visit(node) {
    if (TEXT_KINDS.has(node.kind)) {
      const text = node.getText(sourceFile);
      if (CJK.test(text)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        if (!reportedLines.has(line)) {
          reportedLines.add(line);
          offending.push({ line });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return offending.sort((a, b) => a.line - b.line);
}

const files = listSourceFiles(SRC_DIR).filter((f) => !isIgnored(f));
const problems = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  for (const item of findBareChinese(source)) {
    problems.push({ file: relative(SRC_DIR, file), line: item.line, text: (lines[item.line - 1] ?? "").trim() });
  }
}

if (problems.length > 0) {
  const hint = "发现未走 i18n 的裸中文（请改用 t() 引用，并把文案放入 src/i18n/locales）：";
  console.error(hint + "\n");
  for (const p of problems) {
    console.error(`  src/${p.file}:${p.line}  ${p.text}`);
  }
  console.error(`\n共 ${problems.length} 处。`);
  process.exit(1);
}

console.log("i18n 检查通过：未发现裸中文。");
