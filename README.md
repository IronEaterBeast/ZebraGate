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