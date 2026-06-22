# 更新日志 / Changelog

本项目的所有重要变更都会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 桌面客户端（desktop/）

- 新增「自动更新」：基于官方 `tauri-plugin-updater` 集成端内更新能力。托盘菜单与
  界面（登录页、主界面状态栏）均提供「检查更新」入口；发现新版本时弹原生确认框，
  确认后自动下载、校验签名、安装并重启，已是最新或检查失败均有明确反馈。更新清单地址
  与签名公钥在 `tauri.conf.json` 的 `plugins.updater` 配置（发布方替换为自有地址与公钥）；
  发布流水线在配置了签名私钥（仓库 Secret）时产出签名安装包与 `latest.json` 更新清单；
  正式标签发布缺少签名私钥时会主动中止，只有手动测试构建允许降级为普通安装包。
- 新增「隐私保护」开关：隐私保护原本默认开启并在本地拦截命中敏感关键词的请求，
  但既无界面入口、用户也无从知晓，被拦截时只会收到一条英文 403。本次在分组管理窗口
  顶部提供可勾选的「隐私保护」开关与说明文案（切换即落盘、按后端返回的真实状态回写），
  并把拦截相关的两条面向用户文案（回客户端的错误体 + 桌面端错误面板状态）改为走 i18n
  的中文文案，去掉硬编码英文。
- 修复默认（且当前唯一）语言 `zh-CN` 语言包中残留的未翻译英文文案：登录/退出按钮、
  服务地址 / 密钥 / 模型等字段标签、额度、错误计数、加载中等面向用户文案统一改为中文，
  使首个发布版本在中文环境下文案一致。新增语言包完整性测试，防止后续把源语言英文
  漏翻进唯一发布语言包（`check-i18n` 只查代码里的裸中文，查不到语言包里的漏翻英文）。
- 新增「单实例」保障：重复启动（双击图标、开机自启叠加手动打开等）不再起第二套
  本地代理与托盘，而是把已运行实例的主窗口唤到前台，避免端口冲突与重复代理。
- 新增「开机自启」：托盘菜单提供可勾选的开机自启开关，使用各平台标准机制
  （Windows 注册表 Run 键 / macOS LaunchAgent / Linux .desktop）。

## [1.0.0] - 2026-06-21

首个可发布版本。ZebraGate 由云端管理系统与 Windows 桌面本地代理客户端两部分组成。

### 云端系统（app/）

- 基于成熟 AI 网关系统（New API）的聚合服务：统一接入多家上游 AI 提供方，
  提供用户管理、计费、限流与管理后台。
- 完成 ZebraGate 品牌化：系统名称、日志、前端文案、README 与 i18n 文案统一为 ZebraGate，
  并按 AGPLv3 要求保留上游开源归属与许可声明。

### 桌面客户端（desktop/）

- Tauri + React 桌面应用：登录、分组管理、模型选择、本地代理转发与系统托盘。
- 多语言（i18n）支持，默认 `zh-CN`，所有面向用户文案均走 i18next。
- 本地代理对外暴露 OpenAI 兼容的 `chat/completions` 接口，按分组改写真实模型。
- 内置隐私关键词检查与会话凭据加密存储。

### 发布工程

- 新增仓库根级 GitHub Actions：
  - `ci.yml`：对云端系统（Go + Web 管理端）与桌面客户端（Webview + Rust）跑测试与 lint。
  - `release.yml`：打 `v*` 标签时产出云端系统二进制（Linux/Windows）与桌面 Windows 安装包，
    并上传到 GitHub Release。
- 统一版本基线为 `v1.0.0`（云端 `app/VERSION`、桌面 `package.json` / `tauri.conf.json` / `Cargo.toml`）。

[Unreleased]: https://github.com/IronEaterBeast/ZebraGate/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/IronEaterBeast/ZebraGate/releases/tag/v1.0.0
