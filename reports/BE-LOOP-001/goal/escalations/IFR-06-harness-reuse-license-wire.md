# 交 I 决定 — IFR-06：H 复用边界/许可证 + 公开 Wire `message.final`

提出者：C · 2026-09-22 · 触发：H `H5-proposal`。增量1（截断可见性，插件内、fake 可验）C 已批；以下超出 C 授权，交 I，未决期间**只挂起相关部分**，不阻塞增量1。

## 1. 复用边界变更（H 增量 2：替换 vendored ACP 帧层）
- H 计划把 `third_party/harness_remote/bridge/src/acp-client.js` 手写 JSON-RPC 帧层**换成官方 `@agentclientprotocol/sdk`**，并新增其离线闭包到 `package.json`/lock/`SBOM.json`。
- 虽满足 D-0010（真复用官方帧层，非自写 shim），但**改 vendored 第三方代码 + 引入新依赖闭包 = 复用边界变更**，H 自标「可能需 I 知情」。C 判：技术方向对，但**批准该边界变更 + 引入新上游依赖**宜 I 知情/核准。

## 2. 上游适配器许可证 / 再分发
- `claude-agent-acp` 内部依赖 Anthropic 非 OSI SDK；`codex-acp` 捆绑 `@openai/codex`。增量4 的 pin 升级会改变再分发面。
- **license/合规判定不由 C 或 H 作** → 交 I（法律/产品合规）。

## 3. 公开 Wire：`message.final` 不带 stopReason
- 属**公共 Wire（冻结）**。若产品要在 wire 面区分终局原因，需**公开协议变更** → 交 I。
- 未决期间：H/S 只能在**内部/投影**面处理 stopReason 可见性（增量1 已覆盖内部事实化），不改公开 wire 形状。
- 相关：`_CLEAN_STOP_REASONS` 含非 ACP 值（`sidecar_backend.py:1020`，S 树）→ **不属 I**，已转 **S** 采 H 的映射表裁定（产品解释语义）。
- **S RULING R3（t8）并入本件**：S 实测「缺失 stopReason 必须可见」的任何实现都需新增公开值 / `message.final` 增键 → 与上述 message.final 六键不带 reason 为**同一交 I 公开协议项**。S/H/E 内部与投影面先行处理，公开形状挂起待 I。

## 当前处置
- H 增量1 正常实施/集成。H 增量2 **挂起**待 I 对 (1)(2) 表态；H 愿以 1 次 Sol 做增量2 实施验收（H 0/3 不变）。
- 与 IFR-01（artifacts/change_set 明文留存）同为「秘密/合规/公开协议」类，均交 I，**不混入组内技术收敛**。

## 4. 增量2 公开面范围补全（22:45Z，承本会话新裁定——供 I 见全貌再决，非新请示）
增量2 挂起期间，H 侧公开可见面的**完整清单**应含以下（前件 (1)(2)(3) 之外，均由后续裁定并入本 I 门）：
- **X18 Half-B：`abort()` 非 2xx 必抛/返失败**（新出口事实）——`decisions/X18-half-split-H-1d-b4-delegation.md` 把 abort 审计不诚实半拆：Half-A（零出口）已由 H 增量1d 落地入 `c309395`；**Half-B「使失败可见/可抛」是新增对外出口，随增量2**，其"是否改变 OpenCode 可观测停止形状"若属产品取舍 → 与 **IFR-07** 并判。
- **命名轮公开契约面**：`refused_<单数原因>` 语义 + `<Fact>Outcome`（`DeliveryOutcome` 等）骨架——已发布 `C-EXEC@v1` §追加节（零新协议枚举值、公开投影 M-1 `{recorded,already_recorded,invalid}` 不破），但 X18(a)/abort 侧新词若入命名轮 → 触公开形状，随增量2 一并交 I。
- **净给 I 的一句话**：增量2 = 官方 SDK 帧层 + license/再分发 + `message.final` stopReason + **abort-Half-B 出口** + **H 侧命名轮新词**——五者同属「复用边界 + 公开 Wire/形状」，宜一次性核准或逐项表态。C 仍径行的是纯内部/投影面（已做），**此处只补全 I 决策的公开面清单、不催、不改既有内部实现**。

## 5. 〔加性重述 01:23Z · 承 H6 实测（`harness/reports/H6-ifr06-license-closure.md`＋`goal-H-013`，方法=只读解析 5 lock+1 SBOM、tgz 打到 stdout、2 次 npm view 元数据；零安装零写）〕——(1)(2) 的问题形状按实测更正，(3) 与 §4 公开面清单不变
- **(1) 重述（原前提被实测证伪，I 面对的决定变小而非变大）**：官方 `@agentclientprotocol/sdk` **今日已在再分发闭包内**——`runtime` 腿两处嵌套 `1.3.0`（codex-acp 下、pi-acp 下），license=Apache-2.0、两处 integrity 同值，且已在 `runtime/package.json` 的 `overrides` 里；`runtime-claude`/`runtime-dsh` 另有 hoisted 1.4.0。⇒ 增量2 对 (1) 的**真实变化面仅三条**：同一 Apache-2.0 包由「透传＋override 强降」升为**直接声明**；**1.3.0→1.5.0**（registry 元数据：0 运行时依赖、Apache-2.0、integrity `sha512-524jwbB2iYWA…`、170 文件/555,689B 与 H 早先解包自量逐位吻合）；**闭包 +1 条**。**I 批的不是「新增上游依赖」，而是「已在包内的 Apache-2.0 依赖显式化＋升一个 minor＋帧层迁移实施面」**。既成暴露另记（与增量2 无关）：本仓今日即用 `overrides` 把 pi-acp 自声明的精确 1.4.0 强降为实装 1.3.0。
- **(2) 重述（41 条未判型＝既成面、与增量2 无因果）**：全五腿需人工判读条目共 **41**（claude 腿 9＝`@anthropic-ai/claude-agent-sdk@0.3.270` SEE LICENSE IN README＋8 平台包；kilo 2；qwen 16＝sharp LGPL-3.0 组合＋`@qwen-code/*` 两条无 license 字段；dsh 14）。**而增量2 唯一要动的 `runtime` 腿 349 条中需人工判读＝0**（MIT 199/Apache-2.0 101/BSD-3 27/ISC 14/BlueOak 5/0BSD 2/BSD-2 1）。⇒ 请勿读成「H 迁帧层带来许可证暴露」；41 条是**今日既成再分发面**，归 I/法务择期判读（H 可补读数、不做判定、不读许可证正文）。更正一处：`@openai/codex@0.147.0` 及 6 平台包 lock 层声明全为 Apache-2.0＝**非未判型项**（二进制内是否另有条款，H 不读不判，C 亦不代判）。
- **登记两项（非缺陷主张、供 I 知情）**：①SBOM 覆盖缺口——`artifacts/SBOM.json` 仅 `runtime/` 一枚有，另四腿有 lock 无 SBOM；若 I 的判读需要「再分发清单」级证据，C 将发**限域 SBOM 编制任务**（H 编制、逐路径扩白名单），**非本 IFR 裁定前置**。②`runtime` 一枚内 139 条 `resolved` 指 registry.npmjs.org、210 条指 npmmirror（余四腿 100% mirror）；SBOM note 自述「任意镜像＋记录 integrity 即权威」⇒混合来源被允许，只登记。
- **分拆结论（V2 §6.3：不概括解除 IFR）**：**仍须 I**＝(1) 重述后的核准（显式化＋minor 升级＋帧层迁移实施）、(2) 41 条既成面的判读安排、(3) 公开 `message.final` stopReason（I＋S 账，未动）、§4 的 Half-B 出口与命名轮新词。**C 已内部裁定**＝X20 归属（→H 微增量 1e，另见 `decisions/H6-split-X20-1e-ruling.md`）、SBOM 任务归属预案、41 条/混合来源登记。**增量2 门维持挂起待 I**；H6 使 I 面对的问题形状更准、更小。

## 〔02:25Z 加性状态更新·承 D-0033 §4〕(1) 前提已被 H6 实测重述（§5）且**整体措辞不再阻塞等价重构**——SDK 方向由 D-0032 覆盖、版本/依赖经 C 核实逐批实施；(2) 41 条逐包核证（无笼统许可）；(3) stopReason/结束事实最小公开表达**已获 D-0033 §1 限定授权**、走 B2 字段方案经 C 审实施。本 IFR 余留＝逐包许可证核证结论＋(3) 具体字段形状（均已无整体门）。
