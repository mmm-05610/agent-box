# 工单 070 报告 —— 55 的真实端点探测（R-0011 授权下）

执行：2026-09-18/19，env-provider 工作树。终态：**REAL_ENDPOINT_PROBES_DONE**。
授权：`rulings.md` **R-0011**（真实调用放开、不设预算上限、凭据只作 locator、逐笔记账）。
凭据 locator：`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`（**权限 0600**
实测 `-rw-------`、36 B；只读 locator，内容仅在本进程内用于注入与扫描，未落盘、未打印）。

## 1 阶段与结果

| 阶段 | 结果 |
| --- | --- |
| 1 复核 55 落点与授权口径 | 55 的 G1（schema 8 + provenance 四列 + 两仓重锁）已落地；G2–G4 的**探针实现**已在 `model_configs/probe.py`（含 13 项定向测试），但**接线**与真机证据缺失（见 §2） |
| 2 接线有界探测 + 四类类型化错误 | 修掉两处真实缺陷（§2），补总时限（§2.3）；wire 面两方法端到端测试锁定 |
| 3 真实端点一轮 + 凭据零命中扫描 | **已执行**（§3）：`probeModels` ok（2 个模型 id）、`probeConnection` reachable；2 次 GET；配置零写入；凭据零命中 |
| 4 反例与账 | G1–G5 五类演练各一次（§4）；账务见 §5 |

## 2 本轮发现并修复的真实缺陷（先失败后修）

1. **`providerModels.probeConnection` 接线断了（ImportError）**：`service.probe_connection` 里
   `from agent_box.server.model_configs.probe import probe_connection`，而模块里的函数叫
   `test_connection` ⇒ 该 wire 方法**调用即 500**。此前的 13 项测试都直接调模块函数、从未走
   wire 面，故全绿也未捕获。**修复**：模块函数更名为 `probe_connection`（与 service/wire 词汇一致），
   并新增 **wire 面端到端测试**（Server → wire → service → probe，两方法各一次）——该类接线缺陷由它锁住。
2. **运行时比自己的发布合同更严**：`_PARAM_SHAPES` 把 `providerModels.probeModels` /
   `probeConnection` 的 `credentialId` 当**必填**，而发布的 wire schema 与 wire-review 都写
   `credentialId?`（可选/可 null）⇒ 合法请求被 `INVALID_REQUEST` 拒。**修复**：两方法的 required
   降为 `{requestId, baseUrl}`、`credentialId` 入 optional；测试断言"缺省与显式 null 都接受、
   未知参数仍拒"。
3. **总时限此前未生效**：`TOTAL_TIMEOUT_SECONDS` 已定义但从未使用（只有 socket 级 timeout）——
   drip 式应答可以远超预算。**修复**：分块读 + 总 deadline，超时抛 `PROBE_TIMEOUT`；新增
   drip 测试（另修掉测试 mock 的"永不 EOF"行为，使其成为真正的流）。

## 3 真实端点一轮（第一手）

命令（经真实 Server + wire 面，凭据经内存 store 注入）：

```bash
PYTHONPATH=src:plugins/agent-box-harnesses/src:... python3 /tmp/real-probe-run.py   # 脚本与输出已固化为证据 JSON
```

- `providerModels.probeModels {baseUrl: https://api.deepseek.com, credentialId}` →
  `{"status": "ok", "models": ["deepseek-flash", "deepseek-v4-pro"]}`，**0.218 s**；
- `providerModels.probeConnection {...}` → `{"status": "reachable", "detail": "endpoint answered"}`，**0.176 s**；
- **探测结果未写入任何配置**：`server_provider_models` 行前后摘要一致（digest 相同、行数 0→0），
  `configUnchanged: true`；
- **窗口/能力无来源 ⇒ 留空**：wire 面不存在 `contextWindow`/能力/价目字段（28→30 方法未引入），
  探针结果对象只有 `status/detail/models`；反例测试锁住"不得内置默认值"（§4-G4）。
- 证据 JSON：`docs/server-round1/fullstack/provider-model-55-real-probe.json`
  （sha256 `013128d41c18edfa…`；含 locator 路径与权限位、耗时、响应、前后摘要、扫描结果；**不含凭据内容**）。

## 4 反例演练（G1–G5 各一次，脚本 `/tmp/070-drills.py` 输出）

| 门 | 正向 | 反例（去掉守卫后） | 判定 |
| --- | --- | --- | --- |
| **G1 有界（大小上限）** | 超限响应 → `PROBE_RESPONSE_TOO_LARGE` | 上限放大到 10 MiB ⇒ 同一输入 **no-error** | 上限承重 ✓ |
| **G1 有界（总时限）** | drip（128 B/0.05 s 每片）→ `PROBE_TIMEOUT` | 时限放到 5 s ⇒ 变 `PROBE_FORMAT_INVALID`（不再超时） | 总时限承重 ✓ |
| **G2 凭据零日志** | 扫描器对含注入值的合成 argv **命中 1** | 真实轮产物 0 命中、argv 0 命中 | 扫描器非零命中且真实轮干净 ✓ |
| **G3 类型化** | 四类码 `PROBE_AUTH_FAILED`/`PROBE_UNREACHABLE`/`PROBE_TIMEOUT`/`PROBE_FORMAT_INVALID` 互异（各有测试） | 两码重复即被"互异性"检查标红 | 四类独立 ✓ |
| **G4 未知即未知** | 探针模块与结果对象零内置窗口/价目；测试锁住 | 往副本加 `DEFAULT_CONTEXT_WINDOW = 128000` ⇒ 检查红 | 无内置默认 ✓ |
| **G5 不写配置** | 真实轮前后摘要相同 | 触碰任一配置文件即摘要改变（演练） | 探测不写配置 ✓ |

## 5 账务（R-0011 口径，逐笔）

- **真实请求 2 次**：`GET https://api.deepseek.com/models` ×2（`probeModels` + `probeConnection`）；
  模型列表端点，**0 token 计费**、费用 **¥0**（上限按 R-0011 不设）。
- 其余全部为 loopback 假端点（测试与演练），零外网。
- 清理：临时数据根在脚本结束即删（`--keep` 未用）；无残留进程；`git status` 仅含本单显式路径。

## 6 交回项与已知边界（未擅自处理）

1. **`providerModels.update` 同类不匹配（记录，未改）**：发布 schema 里 `displayName`/`credentialId`
   可选，运行时当必填，且 handler 直接 `params["displayName"]` 取值 ⇒ 若仅放开校验会变成 500。
   正确修法需要"更新时可省略、省略即保留原值"的语义决定——**交回调度者**（建议单独一单）。
2. **`providerArtifacts.install` 反向不匹配（记录）**：schema required 含 `digest`，运行时 required 不含
   （运行时更宽）。同属"运行时与发布合同对齐"类，一并交回。
3. **窗口/能力字段目前不存在记录面**：G4 的"留空"以"探针不写、无内置默认"落地；若产品要展示窗口，
   需要新字段（另派）。
4. **strict 工件复跑观察（非本单引入）**：带 `AGENT_BOX_WIRE_SCHEMA=<本树工件>` 跑 `test_wire_v1` 有
   **5 项既有失败**（`accountId`/`originProfileId`/`permissionPreset`/`permissionRules` 等 56/60 之后新增字段
   不在工件里、以及数组长度上限），属**待重锁**的已知状态（各行"P17/P20 同步与重锁"），与探针改动无关
   （失败集合不含探针方法）。
5. 55 的 `probeModels` 条目上限 512、响应上限 1 MiB、连接 10 s / 总 30 s：本单只补了总时限实现，
   其余沿用；`probeConnection` 与 `probeModels` 共用同一 GET（一次探测即一次请求）。