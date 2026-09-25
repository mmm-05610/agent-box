# 方案 B — 可选安装 / 构建材料与退役移交｜第一阶段只读 — 2026-09-24

工作树 `worktrees/harness-desktop-002/bc-native`，起点 `e996e9d2`，`git diff --cached` 为空。
本文管**运行链之外的东西**：`packaging/` 的构建材料、gate/deploy 旧模板、以及"哪些模块该移交"。

**本文不含**：ACP 帧的收发与路由行为、连接生命周期语义 —— 全部在 `PLAN-ACP-ACCESS.md`。
两份可各自批准或各自否掉。**本文一条删除都不申请执行**。

## 0. 边界

- 只读；本轮新增的只有测试、夹具与本文。
- 运行链不依赖 packaging（实测，见 §1）；不自动安装；不管理整个 Agent 环境。
- 离线：不跑 `npm install`/`npm ci`，不联网取包；所有断言读磁盘上已有的清单、锁与 tarball 字节。
- 不改 `scripts/server-round1/*` 与内核；发现脚本侧异常只上报。

## 1. packaging 现状（实测清单）

| 项 | 实测 |
| --- | --- |
| npm 根 | 6 个：`packaging/{claude,codex,dsh,kilo,pi,qwen}`，各含 `package.json` + `package-lock.json`（`lockfileVersion 3`，`packages[""].name == agent-box-harness-runtime-<brand>`）。**没有 `packaging/opencode`、没有 `packaging/hermes`** |
| 构建器 | 7 个：`scripts/server-round1/build-{claude,codex,dsh,hermes,kilo,pi,qwen}-runtime-artifact.mjs`（比 npm 根多一个 hermes） |
| 桥闭包分离 | codex 根只含 `@agentclientprotocol/codex-acp`，pi 根只含 `@automatalabs/pi-acp`，两把锁互不含对方（已钉） |
| vendor | 只有 `packaging/{codex,pi}/vendor/` 有 tarball；claude/dsh/kilo/qwen 无 |
| 磁盘上是否已安装 | `find packaging -name node_modules` → **0**：离线锁从未被展开 |
| 运行链读 packaging 的路径 | 全量扫描 `runtime/**` 与内核 `src/**` 命中 **0**；唯一 Python 侧字面量是 `codex/executable.py::official_script_metadata()`，且**插件与内核无调用点**（正对照：`scripts/server-round1` 读得到） |

## 2. 构建输入漂移检测（基线，全绿）

`tests/install/test_packaging_boundaries.py`。每个检测器都配"种一个违规 → 必报"的反例，
所以绿不是因为检测器不干活：

| 输入对 | 检测器 | 现状 |
| --- | --- | --- |
| 根 `dependencies` ↔ 锁 | `lock_drift_from` | 6 品牌 0 漂移 |
| `vendor/*.tgz` 文件名版本 ↔ 根声明 | `vendor_drift_from` | codex/pi 0 漂移 |
| `vendor/*.tgz` ↔ 锁闭包 | `vendor_vs_lock_from` | codex/pi 0 漂移 |
| `artifacts/SBOM.json` ↔ 锁闭包（path/version/integrity 全等） | `sbom_vs_lock_from` | codex/pi 0 漂移 |
| 7 个构建器的 `MAX_ENTRIES/MAX_BYTES` | `builder_bounds`（读导出，不 `eval`） | 七个同为 `32768 / 1 GiB` |
| 根 `overrides` 中"不依赖却改写"的名字 | `transitively_overridden_names` | 只有 codex、pi 两处，均为 `@agentclientprotocol/sdk`（§3） |

## 3. 本轮查实的一个真缺陷：Pi 被根 `overrides` 降级了 ACP schema（目标，红）

`packaging/pi/package.json`：

```json
"overrides": { "@automatalabs/pi-acp": "0.5.0", "@agentclientprotocol/sdk": "1.3.0" }
"dependencies": { "@automatalabs/pi-acp": "0.5.0" }
```

根**并不直接依赖** `@agentclientprotocol/sdk`，这条 `overrides` 是纯传递改写。npm 静默应用它，
于是 `@automatalabs/pi-acp@0.5.0` 自己声明的精确 `"@agentclientprotocol/sdk": "1.4.0"` 被改写成 `1.3.0`；
锁 `node_modules/@automatalabs/pi-acp/node_modules/@agentclientprotocol/sdk = 1.3.0` 照实记录，
`npm ci` 退出 0。**装到磁盘上的协议 schema 比 adapter 声明的旧。** 对照：codex 同样有这条 override，
但它的 adapter 声明 `^1.3.0`，被强制的 `1.3.0` 恰好满足 → 只有 pi 中弹。

`tests/install/test_acp_schema_drift_target.py` 从两端各报一次，因为只修一端这类 bug 还会回来：

- `acp_schema_pin_problems`（读锁）＝症状：落到磁盘的是什么；
- `acp_override_problems`（读 `overrides`）＝原因：哪条声明被谁改写。

另有 `satisfies()` 只实现 exact/`^`/`~` 三种范围，**未实现的形状报"not modelled"而不是猜**（猜出来的
"满足"正是不兼容锁能一直出货的原因）。两种范围模型都用种入反例双向钉过。

**本文不自行修 override**：改 pin 会改变离线安装结果，属打包线决定 → 上报（§6-5）。

## 4. "桥 100 MB 下载限制"——查无此数（实测更正）

上一轮 `TEST-REVIEW.md` §5 把它写成了一条已存在的边界。**更正**：全量搜索
（`runtime/`、`third_party/harness_remote/bridge/src/`、`packaging/`、`scripts/`）
中 `100 * 1024` / `100_000_000` / `100MB` / `100 MB` **零命中**。真实存在的首次使用下载约束只有时间形：

| 常量 | 位置 | 值 | 用途 |
| --- | --- | --- | --- |
| `START_TIMEOUT_MS` | `acp-client.js:6`（用于 `:108 start()`） | `90_000` | 注释即写明"`npx` 启动的 adapter 首次使用时要自己下载，冷 PI adapter 在 10 秒时还没拉完" |
| `REQUEST_TIMEOUT_MS` | `acp-client.js:7` | `30_000` | 单请求 |
| `DEFAULT_START_TIMEOUT_MS` | `opencode-host.js:4` | `15_000` | OpenCode 健康检查 |
| `DEFAULT_MAX_ENTRIES` | `transcript-cache.js:17` | `64` | transcript 缓存**条数**上限，非字节 |
| `MAX_ENTRIES` / `MAX_BYTES` | 7 个构建器 | `32768` / `1 GiB` | 构建闭包上限，非下载 |

本轮的处理方式：不发明一个 100 MB 去"通过"这条要求，而是把**确实存在的数**钉成回归——
`test_acp_boundaries.py` 钉住 `START_TIMEOUT_MS == 90_000`，`test_packaging_boundaries.py`
钉住七个构建器同界、且运行链里**没有**自己的字节上限（`MAX_BYTES` 命中 0，`MAX_ENTRIES` 命中只允许是
transcript-cache 那一条）。若 I 认为应当**新增**一个字节上限，那是实施阶段的设计决定，位置在 `acp-client.js` 的下载路径。

## 5. 真实 Agent adapter 协议材料：能测的与测不了的

要求是"补 Codex / OpenCode / Qwen Code / Hermes 的真实 Agent adapter 协议测试"。
**Codex 有真实的**：从 `packaging/codex/vendor/agentclientprotocol-codex-acp-1.1.14.tgz` 里
`package/dist/index.js` 离线解出（自写 tar 读取器，不依赖 `node_modules`）真实方法表
`AGENT_METHODS`(27) / `CLIENT_METHODS`(14) / `PROTOCOL_METHODS` 与 `PROTOCOL_VERSION === 1`，
再要求受控夹具里出现的每个方法名字面量都属于这张表（并种一个假方法名证明扫描会报）。

其余三个**离线测不了真实 adapter**，本轮不假造，而是把这个判断本身写成从磁盘推导的断言
（`real_adapter_protocol.test.mjs` 后两条；类别由 `readdirSync`/`existsSync`/tarball 内容决定，
不是一张手写清单）：

| 品牌 | 磁盘事实 | 结论 |
| --- | --- | --- |
| codex | vendor 包内联 `var AGENT_METHODS` | `tables`：方法字面量可比对 |
| pi | 包 import `@agentclientprotocol/sdk`，该包既未 vendor 也未安装 | `delegated`：无 schema 字节可读 |
| opencode | **无 `packaging/opencode` 目录** | 无离线包可测 |
| hermes | **无 npm 根**；Python 发行，入口 `python3 -m hermes_cli.main acp`，本机 `hermes_cli`/`acp` 不可导入 | 无离线包可测 |
| qwen | 根存在但依赖 `@qwen-code/qwen-code 0.23.4`（CLI 本体），锁内 ACP 包数 = 0 | 声明的是 CLI 不是 adapter |
| claude | 声明并锁定 `@agentclientprotocol/claude-agent-acp 0.77.0`，但无 vendor tarball、无 `node_modules` | 字节不在本地 |

要真测这四个，需要打包线把包 vendor 进来（或授权联网取包）→ 上报（§6-6）。

## 6. 移交清单（本文唯一涉及"删除"的部分；本轮一律不执行）

上一版把 17 个模块列成"候选删/真零读者"。**该表述整体撤回**，理由与实测证据写在
`PLAN-ACP-ACCESS.md` §5（`__all__` 不可作为公共契约证据；三类引用不进 import 计数；上一版自己
记错的两处）。此处只留**归属判断**：

1. **deploy 旧模板** `deploy/<brand>/*`：只被 `*/production.py` → `scripts/server-round1/<brand>-production-chain-gate.py`
   使用；`sidecar.py` 清单不含 `deploy/`，故**不进运行链**。定性 gate-only，保留。
2. **guard 文件**（`egress-guard.c` / `loopback-guard.cjs` / `hermes/loopback-guard.py`）：属沙箱/网络管控，
   在目标职责之外；gate 在读所以不删 → 移交判定。
3. **配置生成**：`*/production.py`（8 品牌）、`native_materialization.py`（`render_*_provider/render_*_config/translate_protocol`）。
   目标是"不生成用户配置"，所以这是**移交候选**，但 `tests/server/test_native_materialization_093*.py` 是 Server 回归，归属须上层定。
4. **`<brand>/provider.py` 归类更正**：上一版把它当"模型 provider"。**实测它是内核
   `work_core/registry.py:127` 的 `ExecutionProvider`（执行代理）**——`descriptor/capabilities/input_limits/start/observe`，
   `provider_id = f"{harness_type}-execution"`。模型 provider 在内核 `server/model_configs/`，插件内零实现。
   详表见 `PLAN-ACP-ACCESS.md` §6。它们的问题是"不在接入链上、只被测试读"，不是"层级放错"。
5. **Profile/provider/model 归属**：`generic/profile_store.py`（`ResourceProvider`，`PROVIDER_ID="harness-profile"`）、
   `generic/{profile_manager,profile_selector,profile_provider,factory}.py`、`*/profile*.py`、
   `codex/{credentials,remote}.py` → 移交候选；`pi`/`codex` 的 override-pin（§3）也在这里一并处理。
6. **委派桥** `runtime/subagent-bridge.mjs`：有内核两端消费者（`sidecar.py:276-277`、`runtime.py:1160`、
   `server/execution/delegation.py`），是产品能力 → 保留/上移由上层定，本轮不动。
7. **bwrap 集成测试**：8 个 `tests/integration/native/harnesses/test_<brand>_real_bwrap.py` 是
   `composition/launch/profile/projection/provider` 唯一的 EXT 消费者；原生接入不依赖 bwrap，
   所以这些模块要么随测试移交，要么保留但注明"仅沙箱线使用"。
8. **`harnesses.toml` 字段裁剪**（`native_home/skill_target/mcp_target/hooks_target/payload_schema/codec/overlay_policy`）：
   删即改 schema 契约，`registry/schema.py` 与多个 Server 测试在读 → 逐字段批准，本轮不动。
9. **脚本异常上报**：`qwen-production-chain-gate.py` 投影的是 `deploy/dsh/loopback-guard.cjs`，而
   `deploy/qwen/loopback-guard.cjs` 也存在。bug 还是有意复用，本轮不改脚本。
10. **两个包 `__init__.py` 的缺陷上报**（不自行修）：`hermes/__init__.py:3-4` 与
    `opencode/__init__.py:7-8` 各把 `__all__` **赋值两次**，第二次覆盖第一次；被覆盖掉的第一次里
    列的 `create_plugin/HermesProfileProvider/HermesExecutionProvider/ProfileRef`（hermes）与
    `OpenCodeExecutionProvider/OpenCodeProfileAuthority/OpenCodeProfileRef`（opencode）
    实测**都不在该包上**（`hasattr` → `False`，名字只存在于 `profile.py`/`provider.py`/`profiles.py`）。
    也就是说第一行 `__all__` 本来就是坏的，第二行的赋值**恰好把它挡住了**：`import *` 现在只导出
    `*ContinuationV1`。附带实测：`opencode.OpenCodeContinuationV1` 的 `contract_id` 没有注解，
    所以不是 dataclass 字段（`fields()` 只有 `session_id`），frozen 相等比较不看契约 id。

## 7. 待批（只有本文范围）

- **B-1** 批准 §2 的六个漂移检测器 + §3 的两端 schema 检测作为 packaging 侧验收基线（含种入反例）。
- **B-2** 确认 §4：**100 MB 下载上限不存在**，本轮只钉住真实存在的数；若要新增请指明位置与值。
- **B-3** 处理 §3 的 pi 缺陷：改 `overrides`、改 pi pin、还是接受"跑在 1.3.0 上"并记录为已知不匹配。
  本文不自行选。
- **B-4** 批准 §5 的口径：Codex 真测，其余四个以磁盘事实声明为"未覆盖"，不补 fake 冒充覆盖。
- **B-5** §6 各条**只要求确认归属**（保留 / 移交 / 上报），本轮不申请任何删除；
  真要删，单开工单并附"改哪条测试会红"的反证。
- **B-6** 不做：不 push、不合并 main、不跑联网安装、不改 gate/构建脚本、不为过测试放宽断言。

## 附录 B1 — 逐模块归属（实测计数；**没有一条是删除申请**）

"零读者"这个说法本轮整体撤回，理由见 `PLAN-ACP-ACCESS.md` §5。下表只回答两件事：
它现在被谁读，以及它**看起来**属于哪条线。† = 被 `test_core_identity.py::MOVED_MODULES` 动态导入钉住；
‡ = 被 `tests/test_boundaries.py:26` 按路径文本断言钉住。

| 模块 | 实测读者 | 看起来属于 |
| --- | --- | --- |
| `adapters/{claude,codex,hermes,opencode,pi}.py` | 各 2 行 `class XAdapter(GenericCliAdapter): pass`；EXT=0（codex EXT=1 仅 identity 测试），INT=1 | 无差异还写空壳 → 收口候选（须同步 `adapters/__init__.py` 与两个兼容性测试清单） |
| `adapters/{dsh,kilo,qwen}.py` | 10–11 行，docstring 自述"仅给 local CLI composition 接缝一个名字" | 同上 |
| `adapters/{base,generic_cli}.py` | EXT=1 each | 唯一有实现的 adapter，保留 |
| `<brand>/native.py`（8 个） | EXT=1：`test_family_dialect_tables.py` | 品牌差异，保留 |
| `<brand>/contracts.py`（claude/codex/hermes/pi） | claude INT=1；codex EXT=2 | continuation 语义 → §6-4 |
| `<brand>/composition.py`（claude/codex/hermes） | EXT=1/2/0，全部 bwrap 集成测试 | §6-7 |
| `deploy/<brand>/*` 模板 | 只被 `*/production.py` → `<brand>-production-chain-gate.py` 读；`sidecar.py` 清单不含 `deploy/` | §6-1 gate-only |
| `deploy/**/{egress-guard.c,loopback-guard.cjs,loopback-guard.py}` | gate 里编译 + `LD_PRELOAD`（如 `claude-production-chain-gate.py:650,655,658,713,731,850,860`） | §6-2 |
| `native_materialization.py`（279 行） | EXT=3，全为测试（含 `tests/server/test_native_materialization_093*.py`） | §6-3；**这才是真·模型 provider 配置渲染**（`[model_providers.<id>]`） |
| `*/production.py`（8 品牌） | EXT=3–6/个：模板测试 + gate 脚本 + 部分 `tests/server/*` | §6-3 |
| `generic/profile_store.py` | EXT=1：`test_generic_profile_store.py`；INT=4 | §6-5（`ResourceProvider`，非模型 provider） |
| `generic/{factory,profile_manager,profile_selector,profile_provider,execution_provider}.py` | `factory` EXT=1；其余 EXT=0 | §6-5 / §6-4（`execution_provider` 是 `ExecutionProvider`） |
| `<brand>/provider.py`（claude/codex/hermes/opencode/pi） | EXT=0–2，均为测试 | §6-4：**执行代理**，不是模型 provider |
| `<brand>/profile{,s}.py`（claude/hermes/opencode） | EXT=1 each（bwrap 集成） | §6-5 |
| `codex/{credentials,remote}.py` | credentials EXT=1；remote EXT=2 + `__all__` 再导出 | §6-5（不读凭据） |
| `codex/hooks.py` | EXT=0 INT=0；实测 gate 不引用 | §6-1 的运行时对偶，归属待确认 |
| `<brand>/projection.py`（hermes/opencode/pi） | EXT=1/0/1 | §6-7（bwrap） |
| `claude.fake_claude` | EXT=0 INT=0，但被 `test_claude_real_bwrap.py` 当**可执行夹具**用 | 移入 `tests/` 比删合适 |
| `importers.models` | EXT=0 INT=0；**实测可导入**（隐式命名空间包，`importlib` 验证过） | "无人导入"≠"不可导入"；补 `__init__.py` 或移交，二选一 |
| `qoder.native_config` | EXT=1（仅自身测试） | 分类宿主已配置 key，与接入职责相容 → 保留定性 |

## 附录 B2 — 与方案 A 的关系

`packaging/` 不参与运行链（§1 实测 0 命中）；方案 A 的目标测试（现 10 条 T1–T10）全在 `tests/access/`，
不读 `packaging/` 的内容做行为断言 —— 只有 `real_adapter_protocol.test.mjs` 把 vendor tarball
当**协议字节的来源**读（读方法表，不读配置）。因此 B 的任何取舍都不会让 A 的测试变色，反之亦然。
