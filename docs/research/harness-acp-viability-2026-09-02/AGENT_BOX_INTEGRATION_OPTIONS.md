# AGENT_BOX_INTEGRATION_OPTIONS — Agent-Box 集成方案 A/B/C/D 比较

观察日期 2026-09-02。证据基础：五家 dossier + [ACP_PROTOCOL_CAPABILITY_MATRIX.md](ACP_PROTOCOL_CAPABILITY_MATRIX.md)
+ [CODEG_ACP_RUNTIME_ARCHAEOLOGY.md](CODEG_ACP_RUNTIME_ARCHAEOLOGY.md) + [NATIVE_VS_ACP_FIDELITY_MATRIX.md](NATIVE_VS_ACP_FIDELITY_MATRIX.md)。

## 四方案定义

- **Option A：五家全部 native** —— 维持现有 Native Adapter/EventDecoder/未来 NativeTransport。
- **Option B：ACP-only** —— 所有 Harness 必须经 ACP，Agent-Box 只实现 ACP Client。
- **Option C：ACP-primary + native fallback** —— planning/governance 链不动；session driver
  优先 ACP，能力不足时回落 native。
- **Option D：per-Harness fixed choice** —— 每家固定选最成熟的一条协议（Codex app-server、
  Gemini ACP、Hermes native document 等），协议选择成为 Registry 的静态事实。

## 比较矩阵

| 维度 | A 全 native | B ACP-only | C ACP-primary + native 兜底 | D per-Harness 固定 |
|---|---|---|---|---|
| 代码量 | 5 套 native transport/decoder（已有 4 套解码器落地） | 1 个 ACP Client + 每 adapter `_meta` 词汇表分支；但 pi/claude 需 wrapper 编排 | 全集：ACP Client + 5 native 兜底 = 最大 | ACP Client + 按家 native（沿用 A 的存量） |
| streaming | 每家原生事件最细 | 统一 session/update；OpenCode/Hermes 好，codex/claude 有损重编码，pi 有帧风险 | 主路统一，兜底恢复原生 | 每家最优 |
| permission/control | 原生 control 协议（claude control_request/codex approval_policy） | 统一 request_permission；**协议无超时**，需宿主策略层；claude/codex 权限模式经 config options 收窄 | 同 B 主路 + native 兜底 | 每家最优（codex native approval_policy 全表达） |
| fidelity | 满分 | **usage/cost 三家残缺；claude result 9 字段无出口；codex --output-schema 不可达；governance 收窄**（见 fidelity 矩阵） | 主路损失同 B，兜底保 P0 | P0 无损（codex/claude/pi 走 native） |
| sandbox/拓扑 | 单进程，不变量最简单 | codex/claude/pi 三层进程树；Runtime 需 kill_tree/pdeathsig/进程组能力（Codeg 三件套）；OpenCode/Hermes 单进程无碍 | 同 B | 仅 vendor-native 走 ACP（单进程）；codex/claude/pi native 单进程 |
| credential isolation | CODEX_HOME/CLAUDE_CONFIG_DIR/HERMES_HOME/XDG 已落地 | wrapper 全量 env 透传（ANTHROPIC_API_KEY 等注入面）；共享 native home（Codeg 模式）= 无隔离但无二次登录 | 同 B | native 通道沿用现有 materializer 边界 |
| version drift | 每家 CLI 漂移（已知、可控、pin 版本探针） | **双源漂移**：adapter（日发布）× harness CLI（日发布）；Codeg 实证 adapter 未宣布的 wire 破坏（codex-acp 1.2.0、kimi 0.37-0.38） | 同 B + native 漂移 | 单源漂移（每家只 pin 一条链） |
| third-party dependency | 无新增 | pi 依赖单维护者 pi-acp（34 天未发版）；claude/codex 依赖协议组织 adapter（质量高） | 同 B | pi 无 ACP 依赖 |
| supply-chain | 官方渠道 | npx 冷启动自动下载（codex/claude/pi）+ claude 每版本 ~100MB 原生二进制；需预装+pin | 同 B | ACP 家走 registry（OpenCode sha256 pin） |
| maintenance | 5 decoder 维护（封闭事件集，改动频率低） | 1 client + 每家 `_meta`/扩展词汇跟踪（`_meta.codex.*`/AIR/`_session/steering`/`x.ai/*`——**特判并未消失**） | 最大（双份词汇） | 1 client + 2 家 native（codex/claude/pi 中仍走 native 的） |
| testing | 每家 fixture（已有 conformance 测试） | fake ACP peer 可测 client；真值仍需 per-harness conformance（capability 广告白名单） | 双倍 | 单份（每家一条链） |
| GUI integration | 现有 Observation 直供 | ObservationHub 需 seq/replay/snapshot（Codeg 已证可行）；`_meta` 特判卡片照旧 | 同 B | 同 B（ACP 家） |
| recovery | native transcript/resume（各家 FACTS） | **协议无 durable replay/reconnect**；load=全量重放、resume=无内容；宿主需自建事件日志 | 同 B | ACP 家接受 load 质量参差 |
| Work Core 影响 | 无 | start/finish 证据链降级（claude result/codex schema 无出口）；Finish 判定证据变薄 | 同 B | 无（P0 家走 native） |
| Plugin API 影响 | 无 | Harnesses 需暴露 SessionDriver 层（见 [RECOMMENDED_SESSION_DRIVER_ARCHITECTURE.md](RECOMMENDED_SESSION_DRIVER_ARCHITECTURE.md)）；Runtime 只见 transport bytes | 同 B | 同 B |

## 判定

- **Option B（ACP-only）今天不可行**：Pi 无实现、codex/claude fidelity P0 损失、协议无
  durable replay/permission 超时——与 Agent-Box usage 记账、structured output、explicit
  Finish 证据链直接冲突。不因"Codeg 跑通了 15 家"而推翻：Codeg 没有 Work/Finish/Evidence
  语义，也没有 cost 记账 P0。
- **Option C（ACP-primary）是伪装的 Option B**：P0 家（codex/claude/pi）在主路即损失 P0，
  "兜底"实际上成为这些家的主路（fallback 条件=每次 P0 需求都触发），只剩维护成本翻倍。
- **Option A 完全成立但不扩展**：Gemini/Qwen/Grok 等未来 registry 对象若强制 native，
  Agent-Box 要为每家写 native transport——而它们恰恰是厂商原生 ACP 质量最高的群体。
- **推荐 Option D（per-Harness fixed choice）作为落地形态**，并以"每家 Registry 静态声明
  主协议 + 可选第二 launch mode"表达：
  - Codex → native（app-server/exec）主，ACP 为未来互操作通道（ACP_OPTIONAL）
  - Claude Code → native stream-json 主，ACP 为外部客户端兼容面（ACP_OPTIONAL）
  - OpenCode → native run-json 主（保 question/todo/undo），ACP 为第二 launch mode（ACP_OPTIONAL，接入成本最低的 vendor-native 案例）
  - Hermes → native `-z` 主（cost/批处理 P0），`hermes acp` 第二 launch mode（ACP_OPTIONAL）
  - Pi → native `--mode json` 唯一（NATIVE_PRIMARY；`--mode rpc` 是 vendor 点名的升级基底）
  - 未来（Gemini/Qwen/Grok…）→ ACP_PRIMARY 直接入 Registry（厂商原生 + registry sha256）
- 即：**D 与 C 的差别在于"主路按家固定、不按次序尝试"**——避免每家都维护两条活路径，
  把 ACP 收敛为"vendor-native 家的第二模式 + 外部互操作面"。

总判决：**否决 ACP-primary（作为五家统一实时会话协议）**；采纳 per-Harness 固定选择 +
vendor-native 家的双 launch mode；native driver 必须保留。
