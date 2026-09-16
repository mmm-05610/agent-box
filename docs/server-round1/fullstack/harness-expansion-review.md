# Harness 扩容分支（feature/harness-expansion-v1）交付核查

日期：2026-09-16。执行者：后端/集成会话（只读核查，未合并、未改写扩容分支）。
对象：`/home/maoqh/projects/agent-box-harness-expansion`，HEAD `c1a7ea9`，基线 `966c314`，
共 10 个提交、55 个文件、+21 616 行。

结论：**没有大的过失，可以开始人手 UI 验收**。发现的 4 处问题都在扩容分支内、改动小，
建议在合并前修掉（§2 第 1、2 条优先）。

## §1 核查了什么（第一手，不是转述）

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 越界写入 | 父仓与前端执行树 `git status` | 两处都 clean，扩容会话没有写别的树 |
| 插件测试 | 在扩容树跑 `pytest plugins/agent-box-harnesses/tests` | **195 passed / 3 skipped** |
| 仓库根测试 | 在扩容树跑 `pytest tests` | **598 passed / 1 skipped** |
| JS 桥测试 | `node --test`（harness_remote + capability_claims） | **38 pass / 0 fail** |
| 门脚本可编译 | 四个新门 `py_compile` | 全部通过 |
| 运行时胶水 | `node --check runtime/profile_extensions.mjs` | 通过 |
| 凭据泄漏 | 在 docs/scripts/plugins 扫密钥字面量 | 零命中（命中的只有 node_modules 里 openai SDK 的类型定义） |
| 大文件入库 | `git ls-files \| grep node_modules` | 0 条；新增的 4 个 runtime 根只提交 package.json/lock |
| **共享桥补丁没破坏原有四家** | **在扩容树里跑 Pi 假端点全链门**（用母树的 c8 Worker bundle 只读） | **exit 0，`PI_PRODUCTION_CHAIN_GATE_OK`**，delta 先于 completed、两轮同 native id、未知模型 0 请求、凭据零泄漏、清理干净——零模型调用、零费用 |

共享桥补丁本身（`third_party/harness_remote/bridge/src/acp-service.js` 的 `setModel`）是**harness
中立**的：把分组配置项展平一层再走原有匹配链。对非分组选择器，
`flatMap(item => Array.isArray(item.options) ? item.options : [item])` 与原件等价，
所以上述 Pi 门通过不是巧合，是结构上应有的结果。

## §2 发现（按优先级）

### 1. kilo 的能力矩阵与它自己的证据文档不一致（真问题，建议合并前修）

- `docs/server-round1/fullstack/kilo-production-packaging.md` §2 写"FAMILY_MATRIX 增加 kilo 行，
  **observed 五项以门证据回填**"，§5/§6 记录假端点门与 `--live` 门都 exit 0。
- 但 `plugins/agent-box-harnesses/tests/test_capability_declarations.py` 里 kilo 仍是
  `NOT_OBSERVED`，注释写"**本仓的门尚未执行**——无运行时证据"，汇总测试也断言 kilo 的
  observed 是空集。
- 也就是说：**文档说回填了，代码里没回填，测试绿着把这个矛盾固定下来**。方向是保守的
  （少报能力，不是多报），所以不影响安全，但正是这个项目最不允许出现的那类不一致。
- 修法：把 kilo 的 observed 五项按 §5 证据回填（与 dsh/claude-code/qwen 同一写法），
  同时改掉注释与汇总断言。

### 2. dsh 证据文档的一处陈旧文案

`dsh-production-packaging.md` §3 写 `deploy/dsh/settings.json：settings 文档选 JSON 格式……
避免为模板引入 YAML 依赖`，但实际落地文件是 **`deploy/dsh/settings.yaml`**（YAML），
`production.py` 的 `SETTINGS_TEMPLATE`/`SETTINGS_SOURCE` 也都指向 `.yaml`，`progress.md`
还专门记了"`off` 必须加引号（YAML 1.1 会解析成布尔）"。只是文档没跟上改动。

### 3. claude-code 的能力降级是产品可见变化（需知会，不是缺陷）

扩容把这家的声明从静态预声明 `[start, observe, finish, attach, native_continuation]`
改成 `[start, observe, finish, stream, native_continuation]`：**移除 `attach`**、加上 `stream`，
同时注册表里的 skill 槽位从 4 个减到 2 个（`slots = ["provider", "instruction"]`）。
理由在文档里是诚实的（官方 ACP 适配器握手播发的 `promptCapabilities` 为空，没有任何附件
投递证据）。但这意味着**界面上 Claude 这类角色不再有附件能力**——这是能力声明的正常后果，
需要让产品侧知道，别当成回归。

### 4. 共享桥补丁没有单测

分组展平这条规则目前只有 dsh 门的端到端覆盖（分组路径）与我这次跑的 Pi 门（非分组路径），
没有一条钉住"展平后匹配顺序不变"的单测。建议补一个小单测（喂分组与非分组两种
`configOptions`，断言选中的 opaque 值相同）。

### 不在本轮范围、如实记账的

- **Goose**：接入卡齐（v1.50.1、`goose acp`、env 三件套、`GOOSE_PATH_ROOT`；musl 静态二进制
  不可用 LD_PRELOAD 守卫），时间盒内未实现；**Aider**：调查后按工单排除规则不接
  （headless 无结构化输出、无 native resume）；**Crush / OpenHands**：按工单顺序未开始。
- **kilo 的未知项**：自带 bwrap 在我方 bwrap 内的嵌套行为未单独验证（两轮门未触发该路径）；
  `--format json` 事件 schema 未逐字段核验（未采用该通道）。
- 新的三家（dsh/qwen/kilo）在**前端**的显示名/i18n 还没有人看过——属于人手 UI 轮的可选后续。
