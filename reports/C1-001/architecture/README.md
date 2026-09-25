# C1-001 architecture — index and method

**本轮性质：架构调研与方案设计。不实施。** 依据 I 的纠正（2026-09-21）与 `control/tasks/C1-001-frontend-first.md`
被暂停的实现要求。产品代码在本轮**不再改动**；已完成的改动保留、不回滚。

## 交付物

| 文件 | 内容 |
| --- | --- |
| `README.md`（本文件） | 范围、方法、阅读顺序、状态、标记约定 |
| `01-code-survey.md` | 现有前端/后端契约与 Slot/插件体系的**只读梳理**（代码事实） |
| `02-architecture-options.md` | 核心语义论证、三类边界、中立边界之争、≥2 方案取舍与渐进迁移 |
| `03-references.md` | 外部参考与出处，逐条标注**适用限制**与**本轮是否实际打开** |

## 标记约定（全文遵守）

- **【代码事实】** 来自本仓库源码/工件的可复现读数，附路径与行号。
- **【设计建议】** 我的主张，可被否决；不冒充既有实现。
- **【未决问题】** 需要 I 或后续验证才能定的，明确留空而**不替读者拍板**。

## 本轮状态（暂停实现后的如实记录）

- 后端树 `worktrees/pi-loop/backend`：HEAD `e2ec0ef2029b7b4905332eb97106b104ccb47ee5`，
  **1 处已提交改动**（`plugins/agent-box-sandbox-bwrap/.../provider.py` 绑定顺序修复，
  详见 `../status.md` 进度五）。**保留、不回滚、本轮不再改产品代码。**
- 桌面树 `worktrees/pi-loop/desktop`：HEAD `80872f556c001b42217d43bf5f73ab08029bfcb9`，干净。
- 我起的服务仍在 `127.0.0.1:18791`（pid 见 `../logs/server.pid`）；**不擅自停止**，因为用户可能在试用。
  停止命令：`kill $(cat /home/maoqh/projects/ordessa/.c1-001-runtime/logs/server.pid)`。
- 真实 Pi 闭环**未验证**（第一轮到达 provider 但失败；根因已定位并修复，验证留待 I 确认后继续）。
  本轮结论**不得**表述为 `PI_GUI_LOOP` 已验证。

## ACK

已 ACK **D-0026**（前端可扩展性优先、后端工作暂停、复用现有 contribution/Slot 框架、以现有服务适配器 +
明确标注的测试适配器验证中立会话边界、Pi 真实闭环随后）。记录见 `../status.md`。

## 一句话结论（详见 `02`）

【设计建议】前端**不需要**新的"通用适配层"就能收敛核心：现有 `Contribution`/`Slot`/SDK 已经是
VS Code module 模型的正确形状，真正缺的是**两件事**——(1) 一条**服务中立的会话接口**，
把现在绑死在 wire v1 与 legacy `HermesGateway` 上的会话核心抽到接口后面；(2) **类型化插槽的覆盖**
（现在只有 titleBar 三处）。后端 wire v1 **可以**直接当中立边界（它已经是 64 方法的 JSON-RPC 契约、
带能力协商与 `_meta` 扩展位），**但不应**把它当成 GUI 的边界——GUI 的边界应是会话语义接口，
wire v1 是它的**一个**实现（服务适配模块）。
