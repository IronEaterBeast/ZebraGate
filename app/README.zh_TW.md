<div align="center">

![ZebraGate](/web/default/public/logo.png)

# ZebraGate

🍥 **新一代大模型網關與 AI 資產管理系統**

<sub>本專案基於開源專案 [New API](https://github.com/QuantumNous/new-api) 二次開發，遵循 AGPL v3.0 協議。</sub>

<p align="center">
  <a href="./README.zh_CN.md">简体中文</a> |
  繁體中文 |
  <a href="./README.md">English</a> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#-快速開始">快速開始</a> •
  <a href="#-主要特性">主要特性</a> •
  <a href="#-部署">部署</a> •
  <a href="#-文件">文件</a> •
  <a href="#-協助支援">協助</a>
</p>

<p align="center">
  🌐 <a href="https://zebragate.com">ZebraGate.com</a>
</p>

</div>

## 📝 專案說明

ZebraGate 是一個統一的大模型聚合與分發網關，將各類大語言模型跨格式轉換為 OpenAI、Claude、Gemini 相容介面，並提供使用者管理、計費、限流與視覺化控制台，面向個人與企業的集中式模型管理與 API 網關場景。

> [!IMPORTANT]
> - 本專案僅面向合法授權的 AI API 網關、組織內部鑑權、多模型管理、用量統計、成本核算與私有化部署場景。
> - 使用者必須合法取得上游 API Key、帳號、模型服務或介面權限，並遵守上游服務條款及適用法律法規。
> - 使用者應確保其使用方式符合上游服務條款及適用法律法規。
> - 面向公眾提供生成式人工智慧服務時，使用者應自行完成所在司法管轄區要求的備案、許可、內容安全、實名、日誌留存、稅務與上游授權等合規義務。

---

## 🚀 快速開始

> [!NOTE]
> ZebraGate 專屬鏡像與倉庫即將發布。當前快速開始範例基於上游 New API 的基礎鏡像，請將其替換為你自己的部署產物。

### 使用 Docker 命令

```bash
# 使用 SQLite（預設）
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

> **💡 提示：** `-v ./data:/data` 會將資料儲存在當前目錄的 `data` 資料夾中，你也可以改為絕對路徑如 `-v /your/custom/path:/data`

🎉 部署完成後，存取 `http://localhost:3000` 即可使用！

> [!WARNING]
> 將本專案作為面向公眾的生成式 AI 服務或 API 轉售服務運營時，使用者應先完成備案、內容安全、實名、日誌留存、稅務、支付與上游授權等合規義務。

---

## ✨ 主要特性

### 🎨 核心功能

| 特性 | 說明 |
|------|------|
| 🎨 現代化 UI | 全新的使用者介面設計 |
| 🌍 多語言 | 支援中文、英文、法語、日語等 |
| 🔄 資料相容 | 完全相容原版 One API 資料庫 |
| 📈 資料看板 | 視覺化控制台與統計分析 |
| 🔒 權限管理 | 令牌分組、模型限制、使用者管理 |

### 💰 授權用量與成本管理

- ✅ 合法授權場景下的內部儲值與額度分配（易支付、Stripe）
- ✅ 組織內按次、按量或快取命中成本核算
- ✅ 支援 OpenAI、Azure、DeepSeek、Claude、Qwen 等模型的快取計費統計
- ✅ 面向內部管理或企業客戶的靈活計費策略設定

### 🔐 授權與安全

- 😈 Discord 授權登入
- 🤖 LinuxDO 授權登入
- 📱 Telegram 授權登入
- 🔑 OIDC 統一認證
- 🔍 Key 查詢使用額度

### 🚀 進階功能

**API 格式支援：**
- ⚡ OpenAI Responses
- ⚡ OpenAI Realtime API（含 Azure）
- ⚡ Claude Messages
- ⚡ Google Gemini
- 🔄 Rerank 模型（Cohere、Jina）

**智慧路由：**
- ⚖️ 渠道加權隨機
- 🔄 失敗自動重試
- 🚦 使用者級別模型限流

**格式轉換：**
- 🔄 **OpenAI Compatible ⇄ Claude Messages**
- 🔄 **OpenAI Compatible → Google Gemini**
- 🔄 **Google Gemini → OpenAI Compatible** - 僅支援文字，暫不支援函式呼叫
- 🚧 **OpenAI Compatible ⇄ OpenAI Responses** - 開發中
- 🔄 **思考轉內容功能**

---

## 🤖 模型支援

| 模型類型 | 說明 |
|---------|------|
| 🤖 OpenAI-Compatible | OpenAI 相容模型 |
| 🤖 OpenAI Responses | OpenAI Responses 格式 |
| 🎨 Midjourney-Proxy | [Midjourney-Proxy(Plus)](https://github.com/novicezk/midjourney-proxy) |
| 🎵 Suno-API | [Suno API](https://github.com/Suno-API/Suno-API) |
| 🔄 Rerank | Cohere、Jina |
| 💬 Claude | Messages 格式 |
| 🌐 Gemini | Google Gemini 格式 |
| 🔧 Dify | ChatFlow 模式 |
| 🎯 自訂上游 | 支援設定合法授權的上游介面位址 |

---

## 🚢 部署

### 📋 部署要求

| 元件 | 要求 |
|------|------|
| **本地資料庫** | SQLite（Docker 需掛載 `/data` 目錄）|
| **遠端資料庫** | MySQL ≥ 5.7.8 或 PostgreSQL ≥ 9.6 |
| **容器引擎** | Docker / Docker Compose |

### ⚙️ 環境變數設定

<details>
<summary>常用環境變數設定</summary>

| 變數名 | 說明 | 預設值 |
|--------|------|--------|
| `SESSION_SECRET` | 工作階段金鑰（多機部署必須） | - |
| `CRYPTO_SECRET` | 加密金鑰（Redis 必須） | - |
| `SQL_DSN` | 資料庫連線字串 | - |
| `REDIS_CONN_STRING` | Redis 連線字串 | - |
| `STREAMING_TIMEOUT` | 串流逾時時間（秒） | `300` |
| `STREAM_SCANNER_MAX_BUFFER_MB` | 串流掃描器單行最大緩衝（MB） | `64` |
| `MAX_REQUEST_BODY_MB` | 請求體最大大小（MB，**解壓後**計） | `32` |
| `AZURE_DEFAULT_API_VERSION` | Azure API 版本 | `2025-04-01-preview` |
| `ERROR_LOG_ENABLED` | 錯誤日誌開關 | `false` |

</details>

### ⚠️ 多機部署注意事項

> [!WARNING]
> - **必須設定** `SESSION_SECRET` - 否則登入狀態不一致
> - **公用 Redis 必須設定** `CRYPTO_SECRET` - 否則資料無法解密

### 🔄 渠道重試與快取

**重試設定：** `設定 → 運營設定 → 通用設定 → 失敗重試次數`

**快取設定：**
- `REDIS_CONN_STRING`：Redis 快取（推薦）
- `MEMORY_CACHE_ENABLED`：記憶體快取

---

## 📚 文件

更多文件與使用指南請存取官網：[ZebraGate.com](https://zebragate.com)

---

## 🔗 相關專案

| 專案 | 說明 |
|------|------|
| [New API](https://github.com/QuantumNous/new-api) | 本專案的上游基礎 |
| [One API](https://github.com/songquanpeng/one-api) | 原版專案基礎 |
| [Midjourney-Proxy](https://github.com/novicezk/midjourney-proxy) | Midjourney 介面支援 |

---

## 💬 協助支援

| 資源 | 連結 |
|------|------|
| 🌐 官網 | [ZebraGate.com](https://zebragate.com) |
| 🐛 回饋問題 | [ZebraGate.com](https://zebragate.com) |

### 🤝 貢獻指南

歡迎各種形式的貢獻：回報 Bug、提出新功能、改進文件、提交程式碼。

---

## 🙏 致謝

- 感謝 [JetBrains](https://www.jetbrains.com/) 為開源專案提供免費的開發授權。
- 本專案基於 [New API](https://github.com/QuantumNous/new-api) 與 [One API](https://github.com/songquanpeng/one-api) 二次開發，特此致謝。

---

## 📜 授權條款

本專案採用 [GNU Affero 通用公共授權條款 v3.0 (AGPLv3)](./LICENSE) 授權。

本專案為開源專案，在 [New API](https://github.com/QuantumNous/new-api)（AGPLv3）與 [One API](https://github.com/songquanpeng/one-api)（MIT）的基礎上進行二次開發。

---

<div align="center">

### 💖 感謝使用 ZebraGate

如果這個專案對你有幫助，歡迎給我們一個 ⭐️ Star！

**[官網 ZebraGate.com](https://zebragate.com)**

</div>
