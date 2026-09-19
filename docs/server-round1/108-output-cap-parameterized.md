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
