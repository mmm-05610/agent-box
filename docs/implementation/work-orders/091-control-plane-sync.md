---
id: 091
slug: control-plane-sync
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0012
terminal: ["CONTROL_PLANE_SYNC_DONE", "CONTROL_PLANE_SYNC_PARTIAL"]
waive: []
parallel_units: ["first-deploy","incremental-sync","credential-projection"]
revisions: [{"at": "1855f35", "what": "\u4fee\u8ba2 v2\uff08R-0055 / AQ-0010 \u7528\u6237\u5df2\u62cd\uff09\uff1a\u6267\u884c\u4fa7\u540c\u6b65\u8bb0\u5f55\uff1d\u6709\u754c\u6295\u5f71\u3001\u6bcf\u6267\u884c\u91cd\u5efa \u21d2 \u2460 \u5173\u95ed\uff1bG1 \u4ee5\u8fdb\u7a0b\u5185\u4e24\u5e93\u6295\u5f71\u9a8c\uff1b\u7981\u6b62\u65b0\u589e Worker op / \u6539 PROTOCOL_VERSION=5 / \u6539 worker JSON schema\u3002\u5269\u4f59\uff1d\u2461 \u65e0\u7248\u672c kind \u7684\u5220\u9664\u8bed\u4e49\uff08schema 18\u219219 \u5893\u7891\uff09\u4e0e \u2462 \u771f\u673a\u90e8\u7f72\uff08\u73b0\u573a\uff1d089\uff09\u3002", "after_stage": 0, "ruling": "R-0055"}]
---

# Work Order 091 — 控制面同步：首次部署 + 增量 + 凭据只在 Windows（每执行投影）

## Objective

按 **R-0012** 实现：**Windows 侧是控制面的权威**（profile、供应商/模型记录、权限规则、指令/资产绑定、工作区记录），
**执行侧**（WSL 或被管理的远端）在**首次连接时**得到一次**部署**，之后每次变更**增量同步**；**凭据内容只在 Windows 侧持有**，
执行侧只在**每次执行**时拿到**一次性投影**，**不进执行侧的持久存储**。**原生 home 与会话仍按平台、不迁移**（跨平台执行＝新的原生会话，保持 45 的语义）。

## Current state

- R-0012 取代 45 §6 中"控制面记录也不同步"的部分；45 §6 其余（home/会话按平台）保持
- 现状：执行侧的记录要么为空（新根）、要么靠手工脚本灌（`desktop-setup.py` 那套）；**没有**"首次连接自动部署 + 变更增量"的机制
- 凭据现状：Windows 根有 2 条（DPAPI 侧），执行侧按执行由部署文档的 `credentialEnvironment` 注入（一次性投影已在 45 §13/56 的规则里）


## 修订 v2（2026-09-19 20:2x，ops；`at` = `1855f35`，**after_stage 0** ⇒ 你尚未收口，直接按修订版做）

**卡口已由用户裁决（`R-0055`，答复 `AQ-0010`，commit `1855f35`）**：执行侧同步记录＝**有界投影、每执行重建**。逐条落到本单：

| 裁决原文（`R-0055`） | 本单怎么做 |
| --- | --- |
| 首部署＝逐执行**幂等重导**清单；**不建跨机持久库** | Stage 2 的"首次部署"按**逐执行重导**实现；**执行侧不留跨机持久同步库** |
| **不新增 Worker op**、**不动 `PROTOCOL_VERSION=5`**、**不动 `protocols/worker/v1.schema.json`** | 不许用新增 op 换实现；`test_the_control_protocol_is_named_in_both_sources` 与 `Bootstrap(deny_unknown_fields)` 两条守卫**必须原样通过**（这是本单"不改协议"的硬约束） |
| 幂等键仍 `(kind,id,version,digest)`：**同一执行期内可增量，跨执行重新有界投影** | Stage 3 的增量语义按此实现；跨执行**不假设**上一执行的痕迹 |
| G1 以**进程内两库投影**验 | G1 的判据按此写（不依赖任何跨机持久物） |
| 本裁决**不动**四条不变式 | 控制面＝Windows、执行侧非权威、原生 home/会话按平台、凭据只在 Windows 按执行一次性投影 —— **一字不改** |

**本单由此关闭 ①**。**剩余（收口时必须如实写进交回）**：
- **② 无版本 kind 的删除语义**（`binding/hook/grant/account` 的增量含删除）⇒ 需要 schema 版本列/墓碑 ＋ `PRODUCT_SCHEMA_VERSION` 抬版 ⇒ **这属新面，先交回 ops/I**，不要在本单里顺手抬版；
- **③ 真机部署**（Windows→`wsl.exe`→WSL worker 的现场）⇒ **现场是 `089`**（A 线），本单只做进程内 G1–G4。

**修订回执（`README §3.5b`）**：纳入本修订后，在下一个阶段提交信息或本树 status 里记一行「已纳入 work order 091 修订 @<sha>」。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 连接建立（执行侧接入/hello 阶段） | **首次部署**：把受同步集合全量推过去；记部署清单与摘要 | 首次连接 |
| 记录变更路径 | **增量同步**：变更即推（幂等键 + 版本号），失败可重放 | 后续变更 |
| 凭据 | 只在 Windows 侧持有；每次执行**一次性投影**到执行侧运行时 | 密钥不落执行侧 |

- **同步集合**（写进文档并逐项实现）：profile 记录（含权限规则/模型槽/指令与资产绑定）、provider/model 记录、工作区记录；
  **不含**：原生 home、会话与转写（按平台）、**凭据内容**
- **冲突规则**：Windows 胜；执行侧不接受"本地改记录"（类型化拒绝并提示在 Windows 侧改）
- 不改 wire 的方法数/形状（若确需新方法 ⇒ 停下交回，与 51–65 同一批重锁）

## Requirements

### Requirement: 首次连接部署

#### Scenario: 空执行侧

**WHEN** 一个空的执行侧首次被接入
**THEN** 受同步集合在两侧**逐项一致**（有部署清单与逐项摘要）；执行侧随后可列出同样的角色/模型

### Requirement: 变更增量

#### Scenario: Windows 侧改一条

**WHEN** 在 Windows 侧修改某条记录
**THEN** 执行侧在下一次同步后与该条一致；重复投递幂等（同版本不重复应用）

### Requirement: 凭据不落执行侧

#### Scenario: 反例

**WHEN** 在执行侧全盘扫描注入值
**THEN** **零命中**（凭据只在执行进程的运行时投影里，不落持久存储）

### Requirement: 执行侧不留跨机持久同步库（**修订 v2**）

#### Scenario: 逐执行重建

**WHEN** 同一执行侧被连接两次（两次执行期）
**THEN** 第二次**重新**做一次有界投影（幂等重导），**不依赖**上一次留在执行侧的持久记录

#### Scenario: 反例（门要能咬）

**WHEN** 把实现改成"执行侧持久库 + 新增 Worker op/抬协议版本"
**THEN** 本单的门与两条协议守卫（`test_the_control_protocol_is_named_in_both_sources`、`Bootstrap(deny_unknown_fields)`）**必须红**

## Stages

- [ ] 1. 同步集合与冲突规则写进文档（提交）
- [ ] 2. 首次部署（含清单与摘要）（提交）
- [ ] 3. 增量同步（幂等 + 版本）（提交）
- [ ] 4. 凭据投影路径 + 零命中反例 + 收口（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 首次部署 | 空执行侧接入后逐项一致（清单+摘要） | 只同步一半即失败 | fail (typed) |
| G2 增量幂等 | 同版本重复投递不重复应用；改动必达 | 丢一条改动即失败 | fail (typed) |
| G3 凭据零落盘 | 执行侧零命中注入值 | 命中即失败 | fail (typed) |
| G4 冲突 Windows 胜 | 执行侧改记录 ⇒ 类型化拒绝 | 静默接受本地改即失败 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "sync or replicate"
grep -rn "sk-\|DEEPSEEK_API_KEY" <执行侧根> 2>/dev/null | grep -v credentialEnvironment || echo "零命中 ✓"
git diff --check && git status --short
```

## DoD

1. 实现：部署 + 增量 + 投影。2. 反例：G1/G2/G3/G4 各一。3. 真实环境：Windows ↔ WSL 一次真实部署与一次增量。
4. 回归：套件计数。5. 账务：零/逐笔。6. 账：本单终态行 + 同步集合清单。

## Acceptance

- 绿：`CONTROL_PLANE_SYNC_DONE`；否则 `CONTROL_PLANE_SYNC_PARTIAL` + 精确剩余
