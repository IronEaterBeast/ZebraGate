# ZebraGate

ZebraGate 是一个基于成熟 AI 网关系统改造的 AI 服务聚合平台，包含云端管理系统和 Windows 桌面本地代理客户端。

## 目录结构

- app/：正式云端系统，包含 Go API 服务和 Web 管理端
- desktop/：ZebraGate Windows 桌面客户端
- references/upstream-new-api/：上游参考代码，只读
- references/old-zebragate/：旧版 ZebraGate 参考代码，只读

## 开发原则

1. app/ 第一阶段尽量保持原系统业务逻辑稳定，只做品牌、配置、接入适配。
2. desktop/ 是 ZebraGate 差异化核心，负责本地代理、托盘、分组和转发。
3. references/ 目录只读，不直接修改。

## 本地运行

整套系统由两部分组成：云端系统（app/，含 Go 后端 + Web 管理端）和桌面客户端（desktop/）。本地开发时通常需要先把后端跑起来，桌面端再连本地后端。

> 说明：Go 后端的 `go.mod` 和 `main.go` 都位于 `app/` 目录下（Go 模块根在 app/，不在仓库根），因此所有 Go 命令都要**先进入 `app/` 目录再执行**。

### 环境要求

- Go 1.25+（后端）
- Bun（app/ 的 Web 管理端使用，见 app/CLAUDE.md）
- pnpm + Rust 工具链（desktop/ 使用，Tauri 需要 Rust）

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

注意：后端通过 `//go:embed web/default/dist` 把前端产物打进二进制。**首次** clone 仓库或 `dist` 目录不存在时，`go run` 会因为找不到 embed 目录而编译失败，需要先构建一次前端（见下一步），生成 `app/web/default/dist` 后再启动后端。之后开发期改前端只需用 dev 服务器，不必再构建。

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
# 第一步：构建 Web 管理端，产出 app/web/default/dist
cd app/web/default
bun install
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

准备好 `desktop/.env.production`（填入正式环境的后端地址）后执行：

```powershell
cd desktop
pnpm build
```

产物为正式 Tauri 安装包。

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
pnpm test            # 等价于 pnpm test:webview && pnpm test:rust
```