<div align="center">

![ZebraGate](/web/default/public/logo.png)

# ZebraGate

🍥 **新一代大模型网关与 AI 资产管理系统**

<sub>本项目基于开源项目 [New API](https://github.com/QuantumNous/new-api) 二次开发，遵循 AGPL v3.0 协议。</sub>

<p align="center">
  简体中文 |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <a href="./README.md">English</a> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> •
  <a href="#-主要特性">主要特性</a> •
  <a href="#-部署">部署</a> •
  <a href="#-文档">文档</a> •
  <a href="#-帮助支持">帮助</a>
</p>

<p align="center">
  🌐 <a href="https://zebragate.com">ZebraGate.com</a>
</p>

</div>

## 📝 项目说明

ZebraGate 是一个统一的大模型聚合与分发网关，将各类大语言模型跨格式转换为 OpenAI、Claude、Gemini 兼容接口，并提供用户管理、计费、限流和可视化控制台，面向个人与企业的集中式模型管理与 API 网关场景。

> [!IMPORTANT]
> - 本项目仅面向合法授权的 AI API 网关、组织内部鉴权、多模型管理、用量统计、成本核算和私有化部署场景。
> - 使用者必须合法取得上游 API Key、账号、模型服务或接口权限，并遵守上游服务条款及适用法律法规。
> - 使用者应确保其使用方式符合上游服务条款及适用法律法规。
> - 面向公众提供生成式人工智能服务时，使用者应遵守[《生成式人工智能服务管理暂行办法》](http://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)等监管要求，自行完成所在司法辖区要求的备案、许可、内容安全、实名、日志留存、税务和上游授权等合规义务。

---

## 🚀 快速开始

> [!NOTE]
> ZebraGate 专属镜像与仓库即将发布。当前快速开始示例基于上游 New API 的基础镜像，请将其替换为你自己的部署产物。

### 使用 Docker 命令

```bash
# 使用 SQLite（默认）
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest

# 使用 MySQL
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="root:123456@tcp(localhost:3306)/oneapi" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

> **💡 提示：** `-v ./data:/data` 会将数据保存在当前目录的 `data` 文件夹中，你也可以改为绝对路径如 `-v /your/custom/path:/data`

🎉 部署完成后，访问 `http://localhost:3000` 即可使用！

> [!WARNING]
> 将本项目作为面向公众的生成式 AI 服务或 API 转售服务运营时，使用者应先完成备案、内容安全、实名、日志留存、税务、支付和上游授权等合规义务。

---

## ✨ 主要特性

### 🎨 核心功能

| 特性 | 说明 |
|------|------|
| 🎨 现代化 UI | 全新的用户界面设计 |
| 🌍 多语言 | 支持中文、英文、法语、日语等 |
| 🔄 数据兼容 | 完全兼容原版 One API 数据库 |
| 📈 数据看板 | 可视化控制台与统计分析 |
| 🔒 权限管理 | 令牌分组、模型限制、用户管理 |

### 💰 授权用量与成本管理

- ✅ 合法授权场景下的内部充值与额度分配（易支付、Stripe）
- ✅ 组织内按次、按量或缓存命中成本核算
- ✅ 支持 OpenAI、Azure、DeepSeek、Claude、Qwen 等模型的缓存计费统计
- ✅ 面向内部管理或企业客户的灵活计费策略配置

### 🔐 授权与安全

- 😈 Discord 授权登录
- 🤖 LinuxDO 授权登录
- 📱 Telegram 授权登录
- 🔑 OIDC 统一认证
- 🔍 Key 查询使用额度

### 🚀 高级功能

**API 格式支持：**
- ⚡ OpenAI Responses
- ⚡ OpenAI Realtime API（含 Azure）
- ⚡ Claude Messages
- ⚡ Google Gemini
- 🔄 Rerank 模型（Cohere、Jina）

**智能路由：**
- ⚖️ 渠道加权随机
- 🔄 失败自动重试
- 🚦 用户级别模型限流

**格式转换：**
- 🔄 **OpenAI Compatible ⇄ Claude Messages**
- 🔄 **OpenAI Compatible → Google Gemini**
- 🔄 **Google Gemini → OpenAI Compatible** - 仅支持文本，暂不支持函数调用
- 🚧 **OpenAI Compatible ⇄ OpenAI Responses** - 开发中
- 🔄 **思考转内容功能**

**Reasoning Effort 支持：**

<details>
<summary>查看详细配置</summary>

**OpenAI 系列模型：**
- `o3-mini-high` / `o3-mini-medium` / `o3-mini-low`
- `gpt-5-high` / `gpt-5-medium` / `gpt-5-low`

**Claude 思考模型：**
- `claude-3-7-sonnet-20250219-thinking` - 启用思考模式

**Google Gemini 系列模型：**
- `gemini-2.5-flash-thinking` - 启用思考模式
- `gemini-2.5-flash-nothinking` - 禁用思考模式
- `gemini-2.5-pro-thinking` - 启用思考模式
- `gemini-2.5-pro-thinking-128` - 启用思考模式，并设置思考预算为 128 tokens
- 也可以直接在 Gemini 模型名称后追加 `-low` / `-medium` / `-high` 来控制思考力度

</details>

---

## 🤖 模型支持

| 模型类型 | 说明 |
|---------|------|
| 🤖 OpenAI-Compatible | OpenAI 兼容模型 |
| 🤖 OpenAI Responses | OpenAI Responses 格式 |
| 🎨 Midjourney-Proxy | [Midjourney-Proxy(Plus)](https://github.com/novicezk/midjourney-proxy) |
| 🎵 Suno-API | [Suno API](https://github.com/Suno-API/Suno-API) |
| 🔄 Rerank | Cohere、Jina |
| 💬 Claude | Messages 格式 |
| 🌐 Gemini | Google Gemini 格式 |
| 🔧 Dify | ChatFlow 模式 |
| 🎯 自定义上游 | 支持配置合法授权的上游接口地址 |

---

## 🚢 部署

### 📋 部署要求

| 组件 | 要求 |
|------|------|
| **本地数据库** | SQLite（Docker 需挂载 `/data` 目录）|
| **远程数据库** | MySQL ≥ 5.7.8 或 PostgreSQL ≥ 9.6 |
| **容器引擎** | Docker / Docker Compose |

### ⚙️ 环境变量配置

<details>
<summary>常用环境变量配置</summary>

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SESSION_SECRET` | 会话密钥（多机部署必须） | - |
| `CRYPTO_SECRET` | 加密密钥（Redis 必须） | - |
| `SQL_DSN` | 数据库连接字符串 | - |
| `REDIS_CONN_STRING` | Redis 连接字符串 | - |
| `STREAMING_TIMEOUT` | 流式超时时间（秒） | `300` |
| `STREAM_SCANNER_MAX_BUFFER_MB` | 流式扫描器单行最大缓冲（MB） | `64` |
| `MAX_REQUEST_BODY_MB` | 请求体最大大小（MB，**解压后**计） | `32` |
| `AZURE_DEFAULT_API_VERSION` | Azure API 版本 | `2025-04-01-preview` |
| `ERROR_LOG_ENABLED` | 错误日志开关 | `false` |

</details>

### 🔧 部署方式

<details>
<summary><strong>Docker 命令</strong></summary>

**使用 SQLite：**
```bash
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

**使用 MySQL：**
```bash
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="root:123456@tcp(localhost:3306)/oneapi" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

> **💡 路径说明：**
> - `./data:/data` - 相对路径，数据保存在当前目录的 data 文件夹
> - 也可使用绝对路径，如：`/your/custom/path:/data`

</details>

### ⚠️ 多机部署注意事项

> [!WARNING]
> - **必须设置** `SESSION_SECRET` - 否则登录状态不一致
> - **公用 Redis 必须设置** `CRYPTO_SECRET` - 否则数据无法解密

### 🔄 渠道重试与缓存

**重试配置：** `设置 → 运营设置 → 通用设置 → 失败重试次数`

**缓存配置：**
- `REDIS_CONN_STRING`：Redis 缓存（推荐）
- `MEMORY_CACHE_ENABLED`：内存缓存

---

## 📚 文档

更多文档与使用指南请访问官网：[ZebraGate.com](https://zebragate.com)

---

## 🔗 相关项目

| 项目 | 说明 |
|------|------|
| [New API](https://github.com/QuantumNous/new-api) | 本项目的上游基础 |
| [One API](https://github.com/songquanpeng/one-api) | 原版项目基础 |
| [Midjourney-Proxy](https://github.com/novicezk/midjourney-proxy) | Midjourney 接口支持 |

---

## 💬 帮助支持

| 资源 | 链接 |
|------|------|
| 🌐 官网 | [ZebraGate.com](https://zebragate.com) |
| 🐛 反馈问题 | [ZebraGate.com](https://zebragate.com) |

### 🤝 贡献指南

欢迎各种形式的贡献：报告 Bug、提出新功能、改进文档、提交代码。

---

## 🙏 致谢

- 感谢 [JetBrains](https://www.jetbrains.com/) 为开源项目提供免费的开发许可证。
- 本项目基于 [New API](https://github.com/QuantumNous/new-api) 与 [One API](https://github.com/songquanpeng/one-api) 二次开发，特此致谢。

---

## 📜 许可证

本项目采用 [GNU Affero 通用公共许可证 v3.0 (AGPLv3)](./LICENSE) 授权。

本项目为开源项目，在 [New API](https://github.com/QuantumNous/new-api)（AGPLv3）与 [One API](https://github.com/songquanpeng/one-api)（MIT）的基础上进行二次开发。

---

<div align="center">

### 💖 感谢使用 ZebraGate

如果这个项目对你有帮助，欢迎给我们一个 ⭐️ Star！

**[官网 ZebraGate.com](https://zebragate.com)**

</div>
