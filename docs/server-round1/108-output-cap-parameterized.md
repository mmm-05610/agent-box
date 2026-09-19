# Work Order 108 — 输出上限参数化（证据 / 逐阶段）

终态：见文末（施工进行中）。基线 `a7b5dbe`；write_paths 于 `49083af` 增补 `scripts/server-round1/**`
（R-0032 / 公告第 103 轮已批"每门一个显式 GATE 上限、模板解耦为部署可声明/宽松缺省、同步钉死测试"）。

## 阶段 1 观测（一手）

**三份模板钉死 64 的确切位置**：
- pi：`deploy/pi/models.json:14` `"maxTokens": 64`（在 `providers.deepseek.models[0]` 里）。
- dsh：`deploy/dsh/settings.yaml:19` `maxTokens: 64`（在 `llm-deepseek` 段里）。
- hermes：`deploy/hermes/config.yaml:4` `max_tokens: 64`（在 `model` 段里）。

**常量**：`OUTPUT_TOKEN_LIMIT = 64` 各在 `pi/production.py:57`、`dsh/production.py:65`、`hermes/production.py:126`。
hermes 门脚本另有一份镜像常量 `hermes-production-chain-gate.py:107`（`OUTPUT_TOKEN_LIMIT = 64`，
运行时在 :1748 `OUTPUT_TOKEN_LIMIT = production.OUTPUT_TOKEN_LIMIT` 覆盖为生产值）。

**字节相等（"第二实现"守卫）测试的确切断言**：
- `test_pi_production_template.py:68` `model["maxTokens"] == production.OUTPUT_TOKEN_LIMIT == 64`；
  且 :31 `test_native_configuration_is_the_prepared_42d_configuration` 跑 `node model-validation-42d.mjs --family pi --dry-run`
  并要求 `prepared["config"] == models_document()`（**逐字段相等，非"包含"**）。
- `test_dsh_production_template.py:32` `section["maxTokens"] == production.OUTPUT_TOKEN_LIMIT == 64`（比对模板文件与模块常量）。
- `test_hermes_production_template.py:113` `document["model"]["max_tokens"] == production.OUTPUT_TOKEN_LIMIT == 64`；
  且 :54 同样跑 42-D 的 `--family hermes --dry-run` 逐字段相等。

**42-D 准备脚本也写死 64**（`scripts/server-round1/model-validation-42d.mjs`）：pi :85 `maxTokens: 64`、
hermes :121/:138 `max_tokens: 64`、（opencode 等别家在 :166/:263/:307 等——**本单只动 pi/dsh/hermes 三家**）。
⇒ 把模板改非 64 时，42-D 的三家 prepared 值**必须同步改**，否则 `test_native_configuration_is_the_prepared_42d_configuration`
（"不许放宽"）红。这是"同步改钉死测试"的一部分，不是新增限制。

**loopback "只换 baseUrl" 的性质**：
- `pi/production.py:135 loopback_models_document` / `dsh:132` / `hermes:273`：只替换 baseUrl（hermes 替换 `model.base_url`+`providers.custom.api` 两处端点）。
- 守卫测试：`test_loopback_override_changes_only_the_base_url`（pi:77 断言 `list(differences)==[baseUrl]` 且 `override.models==template.models`（含 maxTokens 相等）；
  dsh:49 同构 + 断言 `override.maxTokens == template.maxTokens`；hermes:134 断言仅两端口字段 + `override.model.max_tokens == 64`）。

**门侧上限来源（关键：门从**投影出来的 fixture**取上限，不从模板常量取）**：
- 真实链门：把 `loopback_*_document/yaml` 投影进沙箱，harness 读它、对**假端点**发 `max_tokens`，门**记录实际到达 provider 的 `max_tokens`**。
- 门的判据（`hermes-production-chain-gate.py:1158` `if not isinstance(max_tokens,int) or max_tokens > OUTPUT_TOKEN_LIMIT: fail`；
  opencode :802 `structure.maxTokens != production.OUTPUT_TOKEN_LIMIT ⇒ fail`；报告字段 `outputTokenLimit: production.OUTPUT_TOKEN_LIMIT`）。
- 在册 in-process 门测试：`tests/server/test_hermes_production_chain.py` 断言 `recorded.structure.maxTokens == 64`、
  `continuation_evidence` 对 `maxTokens==64` 放行、对 `4096` 判 `HERMES_GATE_OUTPUT_CEILING_EXCEEDED`。

**可读回面**：三家 `harness_deployment` 的 `controlOptions` 只有 `model`（`MODEL_CONTROL_ID="model"`；hermes 不声明模型控件）。
描述符 `model_control_id` 可被 Server 读到；今天没有"输出上限"这个可声明字段。

## 阶段 1 判定的取值来源（工单要求"取一，另一个如实登记为未做"）

- 本单选：**模型事实/模板缺省**（permissive default `8192`），写进静态模板 + 42-D prepared（同步）。
- 部署文档字段（Server 侧按 profile 覆盖渲染投影 maxTokens）：**本单不做**，登记为剩余（其机制属部署文档解析 + 091/092 的投影渲染，且
  要保"投影是 reviewed 只读字节"的不变量 ⇒ 需渲染期物化，非本单范围）。缺省即宽松值＝真实使用不再被 64 截断（G1 的实质：不再写死 64）。

## 设计（三桶，改值同步钉死、不放宽）

1. `production.py`：新增 `DEFAULT_OUTPUT_TOKEN_LIMIT = 8192`（模板/部署缺省）；`OUTPUT_TOKEN_LIMIT = 64` 重定义语义为**门的显式 GATE 上限**（保留名字与 64，
   使门报告/判据/在册门测试逐字段不破）。
2. 静态模板：maxTokens/max_tokens `64 → DEFAULT_OUTPUT_TOKEN_LIMIT`；42-D prepared 三家同步。
3. loopback：仍"只换 baseUrl"（性质与守卫不变）；**但为门的投影**，`loopback_*` 端点副本的 ceiling 由门显式声明为 `OUTPUT_TOKEN_LIMIT`（64）——
   即门在投影 fixture 时把 ceiling 钉到自己的 GATE 值（显式、被记录），不"悄悄继承模板缺省"（G2 反例＝删掉显式钉 ⇒ 门红）。
4. 门脚本：投影 fixture 的 ceiling = `production.OUTPUT_TOKEN_LIMIT`（64）；报告与判据不变。

## 可跑范围与诚实边界

- **可跑（本机）**：三家 `test_*_production_template.py` + `tests/server/test_hermes_production_chain.py`（in-process，用 node 跑 42-D dry-run 与假端点）。
- **不可跑（本机）**：三家 `*-production-chain-gate.py` 的**真实端到端**（需真 Worker/真 sidecar/真 bwrap/预置工件）⇒ 只读源码改 + 定向 in-process 门测试覆盖，真实链门段如实登记为未复跑。

## 阶段 2 参数化（三家模板 + 常量 + 钉死测试同改）

- 三家 `production.py`：新增 `DEFAULT_OUTPUT_TOKEN_LIMIT = 8192`（部署缺省），`OUTPUT_TOKEN_LIMIT = 64` 重定义为**门的显式上限**（保留名与值，门报告/判据/在册门测试逐字段不破）。
- 静态模板改宽松缺省：`deploy/pi/models.json`、`deploy/dsh/settings.yaml`、`deploy/hermes/config.yaml` 的 `maxTokens/max_tokens` `64 → 8192`。
- 42-D prepared 同步（保"逐字段相等"、不放宽）：`model-validation-42d.mjs` 的 `piModelConfig.maxTokens`、`hermesModelConfig.model.max_tokens`、`hermesConfigYaml` 三处 `64 → 8192`（只 pi/hermes；dsh 走文件直比；opencode 等别家**不动**）。
- 钉死测试同步：`test_pi/dsh/hermes_production_template.py` 的 `== OUTPUT_TOKEN_LIMIT == 64` 改为 `== DEFAULT_OUTPUT_TOKEN_LIMIT == 8192`；hermes 落盘文档断言同步；新增三家 **gate-fixture 反例门**（端点覆盖继承 8192，门投影显式钉 64，删钉即红）。
- loopback "只换 baseUrl" 性质**保持**：`loopback_*_document` 仍是纯端点覆盖（继承模板 8192），`documented_differences` 仍只报端点字段；门的显式上限是**另一步** `gate_models_document`/`gate_settings_document`/`gate_projected_config_document`（`pi/dsh/hermes`）。

## 阶段 3 门（真实部署用宽松缺省 + 门显式 64，含反例）

- pi 门：两处投影 fixture（bundle 的 catalog、catalog_bytes）由 `loopback_models_document` → `gate_models_document`（钉 64），"最小覆盖"审计仍走 `documented_differences`（端点-only，绿）。
- dsh 门：两处 `loopback_settings_document` → `gate_settings_document`；注释同步。
- hermes 门：`loopback_config_yaml`（门投影）经 `gate_projected_config_document` 钉 64；判据 `max_tokens > OUTPUT_TOKEN_LIMIT(64)` 不变；镜像常量 :107/覆盖 :1748 仍 64。门脚本无需改调用点。
- 三家链门报告字段 `outputTokenLimit: production.OUTPUT_TOKEN_LIMIT`（=64，门的显式上限）语义不变。

## 验证计数（本机）

- `test_{pi,dsh,hermes}_production_template.py` + `test_hermes_production_chain.py` + `test_capability_declarations.py` + `test_pi_gate_cleanup.py`：**124 passed**（含三家新反例门）。
- 扩面 `-k "production or template or capability or registry or deployment or subagent_harness"`（harness+server）：**358 passed / 2 failed**；两条失败**均为既有环境/无关项**，与本单改动无交集：
  ① `test_sidecar_lease_keepalive` 需 `workers/.../target/debug/agent-box-worker`（未构建的二进制，`FileNotFoundError`）；
  ② `test_skill_projection::test_all_five_registry_targets...` 断言某家 skill guest_target（skills/registry 面，本单 write_paths 不含、diff 未触碰）。
  `test_pi_gate_cleanup` 那 5 条在单独跑本批时因 `--acceptance-bundle-c4` worker 缺失未进此 `-k` 选取（缺预置产物，属既有环境失败类）；其 stub 链不覆盖真实投影，不因本单红。

## §Spend 与清理

- 0 真模型调用（全走假端点/in-process）。无临时工件残留。

## 终态

- **OUTPUT_CAP_PARAMETERIZED_PARTIAL**（可跑门绿、真实链门端到端未复跑）。精确剩余见下：
  1. 三家 `*-production-chain-gate.py` 的**真实端到端**（真 Worker/sidecar/工件）未在本环境复跑；已只读源码改 + in-process 反例门覆盖。
  2. **部署文档字段**这条取值来源**未做**（按工单"取一，另一个如实登记"）：真实使用走宽松缺省 8192；profile 级可声明覆盖需部署文档解析 + 投影渲染期物化，属后续（092/描述符）面。

