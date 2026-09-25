# 拆包就绪评估 001 — 各包公开/私有依赖与迁仓顺序

2026-09-25，随 CP-SESSION-001 汇编。只读评估，未做任何迁仓/安装实验；
「实测」= 本轮读码/构建核验，「推断」= 依声明文件推导、未做干净安装验证。

## 1. 组件与依赖清单

| 组件 | 位置 | 公开（可发布）依赖 | 源码树私有依赖（拆包阻塞点） | 现状可独立发布？ |
| --- | --- | --- | --- | --- |
| **Go ACP 桥** | `~/ordessa-builds/acp-adapter` | **零第三方依赖**（`go.mod` 仅 module+go 1.24，`go.sum` 为空，BUILD-RECORD 记 GOPROXY=off 可构建）【实测】 | 无。外部耦合仅为运行参数（`--pi-bin`、`--pi-session-dir`、trace 路径）与 Pi CLI 版本 | **可以**。构建命令已实测字节级可复现（CP-SESSION-001 §2）；差一个仓内构建脚本/记录 |
| **Pacthold 核心**（`agent_box` 内核+插件 SDK） | `bc-native/src/agent_box` | `dependencies = []`；`server` extra：fastapi/uvicorn/wsproto + `agent-box-harness==2.0.0a1` + `agent-box-runtime-wsl==2.0.0a1` | `agent_box_runtime_wsl` 是 **模块级硬导入**（`server/execution/ssh_connector.py:37` 顶层 `from agent_box_runtime_wsl import WorkerClient…`；`bootstrap/runtime.py:163` WslConnector）——原生 Linux 链也必须装 WSL 插件【实测读码】 | 部分：wheel 可构建，但 server 能力拎不干净（见阻塞 1） |
| **Server 编排**（wire/transport/service） | `bc-native/src/agent_box/{server,service}` | 同上（在 pacthold 包内） | 对 `plugins/agent-box-harness` **树形路径依赖**：native 模式经 `--plugin-root` 解析 `<plugin>/runtime/access-entry.mjs` 与 `<plugin>/third_party/harness_remote/SOURCE.json`（`bootstrap/runtime.py:538-540`【实测】）；受管 ACP 通道另经 `acp_channel/access_entry.py` 包装同一入口 | 不可：部署模型＝源码树 plugin-root，不是已安装包 |
| **agent-box-harness 插件** | `bc-native/plugins/agent-box-harness` | `pacthold==2.0.0a1`、`agent-box-terminal-session==2.0.0a1`；entry-points 6 个（codex/claude/opencode/hermes/pi/profile-store） | **wheel 装不下接缝工件**：`pyproject` 的 package-data 仅 `harnesses.toml`、`codex/*.{json,toml}`；`runtime/*.mjs` 与 `third_party/harness_remote/`（harness profiles、SOURCE.json）在 `src/` 之外，setuptools 根本不会打进去（无 MANIFEST.in【实测】）。接缝运行还要求树内 `third_party/harness_remote/bridge/src/harness-profiles.js` | 不可：Python 包可装，但装完的包**不含** Server native 链必需的入口与 profile 工件 |
| **桌面宿主**（apps/desktop + platform + contracts） | `fc-functional`（npm workspaces 单体） | npm 公共依赖（package-lock 固定）；Electron 本体 | workspace 相对路径互引（platform/extension-*、contracts/*、tooling/build-extension.mjs 均仓内引用）；`run-dev.mjs` 的 `--no-sandbox` 是本机预览口径，生产口径未验证 | 不可（作为一组发布需整体或先抽共享包）；但产品装配以内容寻址产物消费（见下） |
| **前端 ACP 插件**（`plugins/connectors/acp`） | `fc-functional/plugins/connectors/acp` | vitest 套件自 pin `@agentclientprotocol/sdk@1.5.0`（仅 tests 目录，根锁未动） | 对 `apps/desktop/renderer/agent-native` 与 `platform/native-bridge/src` 的 `../../../../` **仅类型导入**（`host.ts:3`、`native.ts:4`【实测】，全插件树仅此一处跨树引用）——编译期擦除，**产物自包含**；源码级独立构建仍需单体树 | 产物可；源码包不可（类型未抽到 contracts 包） |
| **产品装配清单** | `fc-functional/products/agent-desktop` | `extensions.json`+`extensions.lock.json` 以 sha256 钉**已构建产物**（entry.js/native.js/manifest+LICENSE）【实测】 | 构建产物由仓内 build.mjs 产出 | 装配面已就绪（内容寻址），差构建产物的仓外可复现流程 |

## 2. 关键阻塞项（按影响排序）

1. **Server→harness 插件是树形路径依赖而非包依赖**：`--plugin-root` + `runtime/access-entry.mjs`
   + `third_party/harness_remote`。拆包最小方案： либо (a) 把 runtime/、third_party/ 纳入
   agent-box-harness 的 package-data 并让 Server 支持从已安装包定位入口，либо (b) 明确
   「harness 插件以树形工件发布」。当前两者都没有成立。
2. **`ssh_connector.py` 顶层硬导入 `agent_box_runtime_wsl`**：Server 发布物被迫携带 WSL 插件。
   需按 SESSION-BASELINE-TARGET 的「BC 列最短真实依赖链」处理（惰性导入或拆分连接器）。
3. **桌面 ACP 插件类型跨树引用**：`agent-native`/`native-bridge` 类型抽入 contracts 包前，
   插件源码不能脱离单体树构建（产物本身已自包含，仅影响源码级发布与独立 CI）。
4. 三仓基线本身未冻结（CP-SESSION-001 §7）：拆包顺序应排在候选基线 READY 之后。

## 3. 迁仓顺序建议（不授权即不执行）

1. **Go ACP 桥先行**：零依赖、已可复现构建、有上游仓身份——只需补构建记录即可独立成包发布。
2. **Pacthold 核心（不含 server extra 的 WSL 硬导入解耦）**：解阻塞 2 后，
   `pacthold[server]` + `agent-box-harness`（补齐 package-data，阻塞 1）可按「核心包 + 插件包」发布。
3. **桌面单体内部先抽包**：contracts（含 agent-native/native-bridge 类型）→ platform → 各插件；
   产品装配沿用 extensions.lock 内容寻址，迁仓时以产物 sha 不变为验收。
4. 全程在候选基线冻结后、独立树中进行；旧树保留只读，不批量迁移（与 SESSION-BASELINE-TARGET
   「不搞全仓清理或全面搬包」一致）。

## 4. 未验证项

- 未做 wheel/sdist 干净安装实验（pacthold、agent-box-harness 的 `pip install` + 无树运行）。
- 未验证 npm 各 workspace 单独 `npm pack` 的完整性。
- `pacthold` 的 `preview` extra 引用的 agent-box-web/skills 等插件在本基线链路未使用，未评估。
