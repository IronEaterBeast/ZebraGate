# ZebraGate Desktop

ZebraGate 的 Windows 桌面本地代理客户端，基于 **Tauri 2 + React 19** 构建。

它在本机提供一个 OpenAI 兼容的本地代理端点，登录 ZebraGate 账号后即可按「分组」选择模型，
本地应用把请求转发到云端网关，无需在每个工具里手动填写远端地址与密钥。

## 功能

- **账号登录 / 登出**：内嵌云端登录页完成授权，凭据加密存储在本地。
- **分组管理**：创建 / 重命名 / 删除分组，为每个分组选择可用模型。
- **模型目录**：缓存优先 + 退避重试地从云端拉取可用模型列表，离线也能看到上次结果。
- **本地代理**：对外暴露 OpenAI 兼容的 `chat/completions` 接口，按当前分组改写真实模型后转发。
- **系统托盘**：最小化到托盘、快速显示 / 隐藏主窗口、可勾选「开机自启」、检查更新。
- **自动更新**：基于官方 `tauri-plugin-updater`，托盘菜单与界面均可「检查更新」，发现新版本
  后弹确认框，确认即自动下载、校验签名、安装并重启（更新清单地址与签名公钥见下文配置）。
- **单实例运行**：重复启动只唤回已运行窗口，不重复占用端口、不重复起代理。
- **隐私保护**：对外发内容做本地敏感词检查，命中即在本地拦截、不上送云端；分组管理窗口
  提供可勾选的开关与说明，用户可随时查看与开关该能力（默认开启）。
- **多语言（i18n）**：所有面向用户文案走 i18next，默认 `zh-CN`，可扩展更多语言。

## 开发

```powershell
cd desktop
pnpm install

# 复制构建期配置模板，填入本地后端地址（如 http://localhost:3000）
copy .env.example .env.development

# 启动开发版（自动加载 .env.development）
pnpm dev
```

> 远端 API / Web 地址是**构建期**固化进二进制的，开发与生产是两套独立配置：
> `pnpm dev` 读 `.env.development`，`pnpm build` 读 `.env.production`。
> 这两个文件都被 `.gitignore` 忽略，不入库。

## 构建发布安装包

准备好 `desktop/.env.production`（填入正式环境的后端地址）后：

```powershell
cd desktop
pnpm build
```

产物为 Windows NSIS 安装包，位于 `src-tauri/target/release/bundle/nsis/`。

## 测试与检查

```powershell
cd desktop
pnpm lint          # tsc 类型检查 + i18n 裸中文检查
pnpm test          # = pnpm test:webview && pnpm test:rust
```

- `pnpm test:webview`：Vitest 前端单元测试。
- `pnpm test:rust`：`src-tauri` 的 `cargo test`（本地代理、模型校验、加密等核心逻辑）。
- `pnpm check:i18n`：扫描裸中文字符串，未走 `t()` 的文案会被拦下。

## 目录结构

```
src/                React 前端
  pages/            主页与分组管理页
  lib/              本地代理、模型选择、隐私检查、API 客户端封装
  i18n/locales/     语言包（当前 zh-CN）
src-tauri/          Rust 后端（Tauri 命令、本地代理、加密、托盘）
scripts/            check-i18n 等构建脚本
```

## 许可

本项目遵循仓库根目录的 [AGPL-3.0 许可](../LICENSE)。
