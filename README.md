# ZebraGate

ZebraGate 是一个基于成熟 AI 网关系统改造的 AI 服务聚合平台，包含云端管理系统和 Windows 桌面本地代理客户端。

## 核心能力

- **云端 AI 网关**：统一接入多家上游 AI 服务，提供用户、渠道、模型、额度、计费和限流管理。
- **Windows 桌面客户端**：登录 ZebraGate 后，在本机提供 OpenAI 兼容代理接口。
- **分组模型路由**：每个分组拥有独立本地密钥和模型集合，请求会按分组选择真实模型转发。
- **本地隐私保护**：默认在本地检查待发送内容，命中敏感关键词时直接拦截，不上传云端。
- **桌面系统集成**：支持系统托盘、开机自启动、单实例运行和签名自动更新。
- **国际化**：桌面端面向用户的文案统一接入 i18n，当前默认语言为 `zh-CN`。

## 目录结构

- app/：正式云端系统，包含 Go API 服务和 Web 管理端
- desktop/：ZebraGate Windows 桌面客户端
- docs/：设计、排查和测试文档，文件名包含生成时间
- .github/workflows/：持续集成与版本发布工作流
- references/upstream-new-api/：上游参考代码，只读
- references/old-zebragate/：旧版 ZebraGate 参考代码，只读

## 开发原则

1. app/ 第一阶段尽量保持原系统业务逻辑稳定，只做品牌、配置、接入适配。
2. desktop/ 是 ZebraGate 差异化核心，负责本地代理、托盘、分组和转发。
3. references/ 目录只读，不直接修改。

## 本地运行

整套系统由两部分组成：云端系统（app/，含 Go 后端 + Web 管理端）和桌面客户端（desktop/）。本地开发时通常需要先把后端跑起来，桌面端再连本地后端。

> 说明：Go 后端的 `go.mod` 和 `main.go` 都位于 `app/` 目录下（Go 模块根在 app/，不在仓库根），因此所有 Go 命令都要**先进入 `app/` 目录再执行**。

### 运行前配置检查（必读）

本仓库包含多个子项目，配置文件分布在不同目录。启动或构建前，请根据要运行的项目逐项检查，不要直接使用模板中的占位值：

- Go 后端（`app/`）：检查 `app/.env`。首次运行可复制 `app/.env.example` 为 `app/.env`，再按当前环境填写所需配置。后端从 `app/` 目录读取 `.env`；未创建时会使用默认值或系统环境变量。
- 桌面端开发（`desktop/`）：检查 `desktop/.env.development`，确认 API 和 Web 地址指向本地开发环境。可复制 `desktop/.env.example` 后修改。
- 桌面端发布（`desktop/`）：检查 `desktop/.env.production`，确认 API 和 Web 地址均为正式环境真实地址，不得保留 `example.com` 占位值。
- 桌面端自动更新发布：同时检查 `desktop/src-tauri/tauri.conf.json` 中的更新地址和签名公钥，以及 GitHub Actions 中的签名密钥和远端地址配置。

`app/.env`、`desktop/.env.development` 和 `desktop/.env.production` 均属于具体环境的本地配置，请勿提交其中的密码、密钥或真实环境敏感信息。

### 环境要求

- Go 1.25+（后端）
- Bun（`app/web/` 的 Web 管理端使用）
- Node.js 22+、pnpm 10+（桌面 Webview）
- Rust stable 与 Windows 桌面开发环境（Tauri 2）

---

## 一、开发 / 测试时的启动方式

开发调试推荐**前后端分离**跑：后端只跑 Go 服务，前端用 Bun 的开发服务器（热更新），改前端代码不用每次重新构建、也不用重启后端。

### 1. 启动 Go 后端

```powershell
# 进入 Go 模块目录（go.mod / main.go 所在处）
cd app

# 启动后端，默认监听 http://localhost:3000
go run main.go
```

> `go run main.go` 与 `go run .` 等价，二者都在 `app/` 目录下执行即可。

注意：后端通过 `//go:embed` 把 Web 管理端产物打进二进制。**首次** clone 仓库或 `dist` 目录不存在时，需要先构建 Web 前端产物再启动后端。之后开发期改前端只需使用 dev 服务器，不必每次重新构建。

### 2. 启动 Web 管理端开发服务器（热更新）

```powershell
cd app/web/default
bun install        # 首次执行
bun run dev        # 启动前端开发服务器（带热更新）
```

调试管理端界面时访问 dev 服务器地址即可；改前端代码自动热更新，无需重启后端。

### 3. 启动桌面客户端（连本地后端）

桌面端的远端 API / Web 地址在「构建期」固化进二进制，开发与生产是两套独立配置，由构建 profile 自动选择：

- 开发构建（`pnpm dev`）读取 `desktop/.env.development`
- 发布构建（`pnpm build`）读取 `desktop/.env.production`

首次准备本地开发配置：

```powershell
cd desktop
pnpm install

# 复制模板为本地开发配置，填入本地后端地址（如 http://localhost:3000）
# .env.development / .env.production 都会被 .gitignore 忽略，不入库
copy .env.example .env.development
```

之后启动开发版桌面端（会自动加载 `.env.development`，无需每次手动指定环境变量）：

```powershell
cd desktop
pnpm dev
```

---

## 二、部署 / 发布时的启动方式

部署时不再前后端分离，而是把 Web 管理端构建产物 embed 进 Go 二进制，最终交付的是**单个可执行文件**；桌面端则打成正式安装包。

### 1. 构建并部署云端系统（app/）

```powershell
# 第一步：安装 Web 工作区依赖并构建两套管理端
cd app/web
bun install --frozen-lockfile
cd default
bun run build
cd ..\classic
bun run build

# 第二步：在 app/ 目录编译出后端二进制（dist 会被 embed 进去）
cd ..\..
go build -o zebragate.exe main.go
```

构建产物 `app/zebragate.exe` 是包含前端的完整服务，部署时直接运行即可：

```powershell
# 在部署机器上运行（默认监听 http://localhost:3000）
.\zebragate.exe
```

启动后访问 http://localhost:3000 进入管理端。

> 若只想在本机快速验证发布形态，也可以在 `app/` 下用 `go run main.go` 启动（前提是已执行过 `bun run build` 生成 dist）。区别仅在于 `go run` 是临时编译运行、`go build` 产出可分发的二进制。

### 2. 打桌面客户端安装包（desktop/）

准备好 `desktop/.env.production`（填入正式 API 和 Web 地址）后执行：

```powershell
cd desktop
pnpm build
```

普通构建产物为 Windows NSIS 安装包，位于 `desktop/src-tauri/target/release/bundle/nsis/`。

#### 桌面端构建期地址

桌面端使用以下两个构建期参数：

```dotenv
ZEBRAGATE_DESKTOP_REMOTE_API_BASE_URL=https://api.example.com
ZEBRAGATE_DESKTOP_WEB_BASE_URL=https://app.example.com
```

本地开发时复制 `desktop/.env.example` 为 `desktop/.env.development`；正式构建时复制为 `desktop/.env.production`。模板中的 `example.com` 仅为占位地址，正式安装包不得保留该值，也不要把包含真实环境地址的本地 `.env` 文件提交到仓库。

#### 桌面端自动更新签名

自动更新由 `desktop/src-tauri/tauri.conf.json` 中的 `plugins.updater` 配置更新清单地址和签名公钥。正式发布前必须：

1. 将 updater endpoint 替换为实际可访问的 `latest.json` 地址。
2. 将 `pubkey` 设置为与发布签名私钥配套的公钥。
3. 在 GitHub Actions Secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY`，私钥有密码时同时配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
4. 配置 `ZEBRAGATE_DESKTOP_REMOTE_API_BASE_URL` 与 `ZEBRAGATE_DESKTOP_WEB_BASE_URL`。

推送 `v*` 标签时，发布工作流会验证四处版本号一致，生成签名安装包、`.sig` 和 `latest.json`，再上传 GitHub Release。正式标签发布缺少签名私钥时会中止；手动触发工作流才允许构建不支持自动更新的普通安装包。

---

## 三、运行测试

### 后端（app/）

```powershell
cd app
go test ./...        # 运行全部 Go 测试
```

### 桌面端（desktop/，前端 vitest + Rust cargo test）

```powershell
cd desktop
pnpm lint            # TypeScript + i18n 裸中文检查
pnpm test            # 等价于 pnpm test:webview && pnpm test:rust
pnpm build:webview   # 验证桌面 Webview 生产构建
```

- `pnpm test:webview`：运行 Vitest 前端单元测试。
- `pnpm test:rust`：运行本地代理、模型校验、加密等 Rust 核心逻辑测试。
- `pnpm check:i18n`：扫描 `desktop/src` 中未接入 i18n 的裸中文文案。
- `pnpm build:webview`：执行 TypeScript 检查并生成 Webview 生产构建。

提交或发布前应同时运行云端与桌面端检查。仓库根级 CI 会在推送和 Pull Request 时构建两套 Web 管理端、运行 Go 测试，并执行桌面端 lint、Webview 测试和 Rust 测试。

---

## 四、版本发布

- 四处版本号必须一致：`app/VERSION`、`desktop/package.json`、`desktop/src-tauri/Cargo.toml`、`desktop/src-tauri/tauri.conf.json`。
- 推送 `v*` 标签会触发 `.github/workflows/release.yml`，构建 Linux/Windows 云端二进制和 Windows 桌面安装包。
- 桌面端正式发布必须配置远端地址及 Tauri 更新签名 Secrets；缺少签名私钥时，标签发布会主动中止。
- 发布前必须完成自动测试和 Windows 手工验收，不应仅以编译成功作为发布依据。

发布前手工验收见 [ZebraGate v1.0.0 发布前手工测试方案](docs/20260622-1641-v1.0.0发布前手工测试方案.md)。版本变化记录见 [CHANGELOG.md](CHANGELOG.md)。

### 桌面端源码结构

```text
desktop/src/                React Webview
desktop/src/pages/          主页面与分组管理页面
desktop/src/lib/            API、代理状态与模型选择封装
desktop/src/i18n/locales/   桌面端语言包
desktop/src-tauri/          Tauri/Rust 后端、本地代理与系统集成
desktop/scripts/            i18n 等检查脚本
```

## 许可

本项目使用 [GNU Affero General Public License v3.0](LICENSE)。基于上游开源项目改造的部分继续遵循相应许可与归属要求。
