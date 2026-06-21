<div align="center">

![ZebraGate](/web/default/public/logo.png)

# ZebraGate

🍥 **Next-Generation LLM Gateway and AI Asset Management System**

<sub>Built on the open-source project [New API](https://github.com/QuantumNous/new-api), licensed under AGPL v3.0.</sub>

<p align="center">
  <a href="./README.zh_CN.md">简体中文</a> |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <strong>English</strong> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-documentation">Documentation</a> •
  <a href="#-support">Support</a>
</p>

<p align="center">
  🌐 <a href="https://zebragate.com">ZebraGate.com</a>
</p>

</div>

## 📝 About

ZebraGate is a unified LLM aggregation and distribution gateway. It cross-converts a wide range of large language models into OpenAI-, Claude-, and Gemini-compatible APIs, and provides user management, billing, rate limiting, and a visual dashboard — a centralized model management and API gateway for individuals and enterprises.

> [!IMPORTANT]
> - This project is intended only for legally authorized AI API gateway, internal organizational authentication, multi-model management, usage statistics, cost accounting, and self-hosted deployment scenarios.
> - Users must legally obtain upstream API keys, accounts, model services, or interface permissions, and comply with upstream terms of service and applicable laws and regulations.
> - Users are responsible for ensuring their usage complies with upstream terms of service and applicable laws and regulations.
> - When providing generative AI services to the public, users must complete any filing, licensing, content safety, real-name verification, log retention, tax, and upstream authorization obligations required in their jurisdiction.

---

## 🚀 Quick Start

> [!NOTE]
> Dedicated ZebraGate images and repository are coming soon. The quick-start example below uses the upstream New API base image — replace it with your own deployment artifact.

### Using Docker

```bash
# With SQLite (default)
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest

# With MySQL
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="root:123456@tcp(localhost:3306)/oneapi" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

> **💡 Tip:** `-v ./data:/data` stores data in the `data` folder of the current directory. You may also use an absolute path like `-v /your/custom/path:/data`.

🎉 Once deployed, visit `http://localhost:3000` to get started!

> [!WARNING]
> When operating this project as a public-facing generative AI service or API resale service, users must first complete filing, content safety, real-name verification, log retention, tax, payment, and upstream authorization obligations.

---

## ✨ Features

### 🎨 Core

| Feature | Description |
|---------|-------------|
| 🎨 Modern UI | Brand-new user interface design |
| 🌍 Multilingual | Chinese, English, French, Japanese, and more |
| 🔄 Data Compatibility | Fully compatible with the original One API database |
| 📈 Dashboard | Visual console with statistics and analytics |
| 🔒 Access Control | Token grouping, model restrictions, user management |

### 💰 Authorized Usage & Cost Management

- ✅ Internal top-ups and quota allocation under authorized scenarios (EPay, Stripe)
- ✅ Per-request, per-usage, or cache-hit cost accounting within organizations
- ✅ Cache billing statistics for OpenAI, Azure, DeepSeek, Claude, Qwen, and more
- ✅ Flexible billing policy configuration for internal management or enterprise clients

### 🔐 Authentication & Security

- 😈 Discord OAuth login
- 🤖 LinuxDO OAuth login
- 📱 Telegram OAuth login
- 🔑 OIDC unified authentication
- 🔍 Key quota lookup

### 🚀 Advanced

**API format support:**
- ⚡ OpenAI Responses
- ⚡ OpenAI Realtime API (incl. Azure)
- ⚡ Claude Messages
- ⚡ Google Gemini
- 🔄 Rerank models (Cohere, Jina)

**Smart routing:**
- ⚖️ Weighted random channel selection
- 🔄 Automatic retry on failure
- 🚦 Per-user model rate limiting

**Format conversion:**
- 🔄 **OpenAI Compatible ⇄ Claude Messages**
- 🔄 **OpenAI Compatible → Google Gemini**
- 🔄 **Google Gemini → OpenAI Compatible** — text only, function calling not yet supported
- 🚧 **OpenAI Compatible ⇄ OpenAI Responses** — in development
- 🔄 **Reasoning-to-content conversion**

---

## 🤖 Model Support

| Type | Description |
|------|-------------|
| 🤖 OpenAI-Compatible | OpenAI-compatible models |
| 🤖 OpenAI Responses | OpenAI Responses format |
| 🎨 Midjourney-Proxy | [Midjourney-Proxy(Plus)](https://github.com/novicezk/midjourney-proxy) |
| 🎵 Suno-API | [Suno API](https://github.com/Suno-API/Suno-API) |
| 🔄 Rerank | Cohere, Jina |
| 💬 Claude | Messages format |
| 🌐 Gemini | Google Gemini format |
| 🔧 Dify | ChatFlow mode |
| 🎯 Custom Upstream | Configure legally authorized upstream endpoints |

---

## 🚢 Deployment

### 📋 Requirements

| Component | Requirement |
|-----------|-------------|
| **Local DB** | SQLite (mount `/data` for Docker) |
| **Remote DB** | MySQL ≥ 5.7.8 or PostgreSQL ≥ 9.6 |
| **Container** | Docker / Docker Compose |

### ⚙️ Environment Variables

<details>
<summary>Common environment variables</summary>

| Variable | Description | Default |
|----------|-------------|---------|
| `SESSION_SECRET` | Session secret (required for multi-node) | - |
| `CRYPTO_SECRET` | Encryption secret (required with Redis) | - |
| `SQL_DSN` | Database connection string | - |
| `REDIS_CONN_STRING` | Redis connection string | - |
| `STREAMING_TIMEOUT` | Streaming timeout (seconds) | `300` |
| `STREAM_SCANNER_MAX_BUFFER_MB` | Max per-line buffer for streaming (MB) | `64` |
| `MAX_REQUEST_BODY_MB` | Max request body size (MB, **after decompression**) | `32` |
| `AZURE_DEFAULT_API_VERSION` | Azure API version | `2025-04-01-preview` |
| `ERROR_LOG_ENABLED` | Error logging switch | `false` |

</details>

### ⚠️ Multi-node Notes

> [!WARNING]
> - **Must set** `SESSION_SECRET` — otherwise login state will be inconsistent.
> - **Must set** `CRYPTO_SECRET` when sharing Redis — otherwise data cannot be decrypted.

### 🔄 Channel Retry & Caching

**Retry:** `Settings → Operations → General → Failure Retry Count`

**Caching:**
- `REDIS_CONN_STRING`: Redis cache (recommended)
- `MEMORY_CACHE_ENABLED`: in-memory cache

---

## 📚 Documentation

For more documentation and guides, visit the official site: [ZebraGate.com](https://zebragate.com)

---

## 🔗 Related Projects

| Project | Description |
|---------|-------------|
| [New API](https://github.com/QuantumNous/new-api) | Upstream base of this project |
| [One API](https://github.com/songquanpeng/one-api) | Original project base |
| [Midjourney-Proxy](https://github.com/novicezk/midjourney-proxy) | Midjourney interface support |

---

## 💬 Support

| Resource | Link |
|----------|------|
| 🌐 Website | [ZebraGate.com](https://zebragate.com) |
| 🐛 Feedback | [ZebraGate.com](https://zebragate.com) |

### 🤝 Contributing

Contributions of all kinds are welcome: report bugs, propose features, improve docs, submit code.

---

## 🙏 Acknowledgements

- Thanks to [JetBrains](https://www.jetbrains.com/) for providing free open-source development licenses.
- This project is built on [New API](https://github.com/QuantumNous/new-api) and [One API](https://github.com/songquanpeng/one-api). Our sincere thanks to both.

---

## 📜 License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE).

It is an open-source project developed on top of [New API](https://github.com/QuantumNous/new-api) (AGPLv3) and [One API](https://github.com/songquanpeng/one-api) (MIT).

---

<div align="center">

### 💖 Thanks for using ZebraGate

If this project helps you, please give us a ⭐️ Star!

**[ZebraGate.com](https://zebragate.com)**

</div>
