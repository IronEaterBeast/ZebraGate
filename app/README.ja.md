<div align="center">

![ZebraGate](/web/default/public/logo.png)

# ZebraGate

🍥 **次世代大規模モデルゲートウェイと AI 資産管理システム**

<sub>本プロジェクトはオープンソースプロジェクト [New API](https://github.com/QuantumNous/new-api) をベースに二次開発しており、AGPL v3.0 ライセンスに従います。</sub>

<p align="center">
  <a href="./README.zh_CN.md">简体中文</a> |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <a href="./README.md">English</a> |
  <a href="./README.fr.md">Français</a> |
  日本語
</p>

<p align="center">
  <a href="#-クイックスタート">クイックスタート</a> •
  <a href="#-主な特徴">主な特徴</a> •
  <a href="#-デプロイ">デプロイ</a> •
  <a href="#-ドキュメント">ドキュメント</a> •
  <a href="#-サポート">サポート</a>
</p>

<p align="center">
  🌐 <a href="https://zebragate.com">ZebraGate.com</a>
</p>

</div>

## 📝 プロジェクト概要

ZebraGate は統合型の大規模モデル集約・配信ゲートウェイです。さまざまな大規模言語モデルを OpenAI、Claude、Gemini 互換 API に形式変換し、ユーザー管理、課金、レート制限、可視化ダッシュボードを提供します。個人および企業向けの集中型モデル管理と API ゲートウェイです。

> [!IMPORTANT]
> - 本プロジェクトは、合法的に認可された AI API ゲートウェイ、組織内認証、マルチモデル管理、使用量統計、コスト計算、セルフホストデプロイのシナリオのみを対象としています。
> - 利用者は上流の API キー、アカウント、モデルサービス、またはインターフェース権限を合法的に取得し、上流の利用規約および適用法令を遵守しなければなりません。
> - 利用者は、その利用方法が上流の利用規約および適用法令に準拠していることを保証する責任があります。
> - 生成 AI サービスを一般に提供する場合、利用者は管轄区域で要求される届出、許可、コンテンツ安全、実名認証、ログ保持、税務、上流認可などのコンプライアンス義務を自ら完了する必要があります。

---

## 🚀 クイックスタート

> [!NOTE]
> ZebraGate 専用イメージとリポジトリは近日公開予定です。以下のクイックスタート例は上流 New API のベースイメージを使用しています。ご自身のデプロイ成果物に置き換えてください。

### Docker コマンドを使用

```bash
# SQLite を使用（デフォルト）
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest

# MySQL を使用
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="root:123456@tcp(localhost:3306)/oneapi" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

> **💡 ヒント：** `-v ./data:/data` はカレントディレクトリの `data` フォルダにデータを保存します。`-v /your/custom/path:/data` のように絶対パスも使用できます。

🎉 デプロイ完了後、`http://localhost:3000` にアクセスして利用開始！

> [!WARNING]
> 本プロジェクトを一般向けの生成 AI サービスや API 再販サービスとして運用する場合、利用者は届出、コンテンツ安全、実名認証、ログ保持、税務、決済、上流認可などのコンプライアンス義務を先に完了する必要があります。

---

## ✨ 主な特徴

### 🎨 コア機能

| 特徴 | 説明 |
|------|------|
| 🎨 モダンな UI | 刷新されたユーザーインターフェース |
| 🌍 多言語 | 中国語、英語、フランス語、日本語などに対応 |
| 🔄 データ互換 | オリジナル版 One API データベースと完全互換 |
| 📈 ダッシュボード | 可視化コンソールと統計分析 |
| 🔒 権限管理 | トークングループ、モデル制限、ユーザー管理 |

### 💰 認可された使用量とコスト管理

- ✅ 認可されたシナリオでの内部チャージと割当配分（EPay、Stripe）
- ✅ 組織内での回数・量・キャッシュヒット単位のコスト計算
- ✅ OpenAI、Azure、DeepSeek、Claude、Qwen などのキャッシュ課金統計に対応
- ✅ 内部管理または企業顧客向けの柔軟な課金ポリシー設定

### 🔐 認証とセキュリティ

- 😈 Discord 認証ログイン
- 🤖 LinuxDO 認証ログイン
- 📱 Telegram 認証ログイン
- 🔑 OIDC 統一認証
- 🔍 キー使用量照会

### 🚀 高度な機能

**API 形式のサポート：**
- ⚡ OpenAI Responses
- ⚡ OpenAI Realtime API（Azure 含む）
- ⚡ Claude Messages
- ⚡ Google Gemini
- 🔄 Rerank モデル（Cohere、Jina）

**スマートルーティング：**
- ⚖️ チャネル加重ランダム
- 🔄 失敗時の自動リトライ
- 🚦 ユーザー単位のモデルレート制限

**形式変換：**
- 🔄 **OpenAI Compatible ⇄ Claude Messages**
- 🔄 **OpenAI Compatible → Google Gemini**
- 🔄 **Google Gemini → OpenAI Compatible** - テキストのみ、関数呼び出しは未対応
- 🚧 **OpenAI Compatible ⇄ OpenAI Responses** - 開発中
- 🔄 **思考からコンテンツへの変換機能**

---

## 🤖 モデルサポート

| 種類 | 説明 |
|------|------|
| 🤖 OpenAI-Compatible | OpenAI 互換モデル |
| 🤖 OpenAI Responses | OpenAI Responses 形式 |
| 🎨 Midjourney-Proxy | [Midjourney-Proxy(Plus)](https://github.com/novicezk/midjourney-proxy) |
| 🎵 Suno-API | [Suno API](https://github.com/Suno-API/Suno-API) |
| 🔄 Rerank | Cohere、Jina |
| 💬 Claude | Messages 形式 |
| 🌐 Gemini | Google Gemini 形式 |
| 🔧 Dify | ChatFlow モード |
| 🎯 カスタム上流 | 合法的に認可された上流エンドポイントを設定可能 |

---

## 🚢 デプロイ

### 📋 デプロイ要件

| コンポーネント | 要件 |
|------|------|
| **ローカル DB** | SQLite（Docker は `/data` ディレクトリのマウントが必要）|
| **リモート DB** | MySQL ≥ 5.7.8 または PostgreSQL ≥ 9.6 |
| **コンテナ** | Docker / Docker Compose |

### ⚙️ 環境変数の設定

<details>
<summary>よく使う環境変数の設定</summary>

| 変数名 | 説明 | デフォルト値 |
|--------|------|--------|
| `SESSION_SECRET` | セッションキー（マルチノードでは必須） | - |
| `CRYPTO_SECRET` | 暗号化キー（Redis では必須） | - |
| `SQL_DSN` | データベース接続文字列 | - |
| `REDIS_CONN_STRING` | Redis 接続文字列 | - |
| `STREAMING_TIMEOUT` | ストリーミングタイムアウト（秒） | `300` |
| `STREAM_SCANNER_MAX_BUFFER_MB` | ストリーミングスキャナの1行あたり最大バッファ（MB） | `64` |
| `MAX_REQUEST_BODY_MB` | リクエストボディの最大サイズ（MB、**解凍後**） | `32` |
| `AZURE_DEFAULT_API_VERSION` | Azure API バージョン | `2025-04-01-preview` |
| `ERROR_LOG_ENABLED` | エラーログのスイッチ | `false` |

</details>

### ⚠️ マルチノードデプロイの注意事項

> [!WARNING]
> - **必ず設定** `SESSION_SECRET` - そうしないとログイン状態が一致しません。
> - **共用 Redis では必ず設定** `CRYPTO_SECRET` - そうしないとデータを復号できません。

### 🔄 チャネルリトライとキャッシュ

**リトライ設定：** `設定 → 運用設定 → 一般設定 → 失敗リトライ回数`

**キャッシュ設定：**
- `REDIS_CONN_STRING`：Redis キャッシュ（推奨）
- `MEMORY_CACHE_ENABLED`：メモリキャッシュ

---

## 📚 ドキュメント

より詳しいドキュメントとガイドは公式サイトをご覧ください：[ZebraGate.com](https://zebragate.com)

---

## 🔗 関連プロジェクト

| プロジェクト | 説明 |
|------|------|
| [New API](https://github.com/QuantumNous/new-api) | 本プロジェクトの上流ベース |
| [One API](https://github.com/songquanpeng/one-api) | オリジナル版プロジェクトのベース |
| [Midjourney-Proxy](https://github.com/novicezk/midjourney-proxy) | Midjourney インターフェースのサポート |

---

## 💬 サポート

| リソース | リンク |
|------|------|
| 🌐 公式サイト | [ZebraGate.com](https://zebragate.com) |
| 🐛 フィードバック | [ZebraGate.com](https://zebragate.com) |

### 🤝 コントリビューション

あらゆる形での貢献を歓迎します：バグ報告、新機能の提案、ドキュメントの改善、コードの提出。

---

## 🙏 謝辞

- オープンソースプロジェクトに無償の開発ライセンスを提供してくださる [JetBrains](https://www.jetbrains.com/) に感謝します。
- 本プロジェクトは [New API](https://github.com/QuantumNous/new-api) と [One API](https://github.com/songquanpeng/one-api) をベースに二次開発しています。両プロジェクトに深く感謝します。

---

## 📜 ライセンス

本プロジェクトは [GNU Affero 一般公衆ライセンス v3.0 (AGPLv3)](./LICENSE) の下でライセンスされています。

本プロジェクトはオープンソースプロジェクトであり、[New API](https://github.com/QuantumNous/new-api)（AGPLv3）と [One API](https://github.com/songquanpeng/one-api)（MIT）をベースに二次開発しています。

---

<div align="center">

### 💖 ZebraGate をご利用いただきありがとうございます

このプロジェクトが役立ったら、ぜひ ⭐️ Star をお願いします！

**[ZebraGate.com](https://zebragate.com)**

</div>
