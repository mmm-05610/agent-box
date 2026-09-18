# 工单 069 报告 —— 54 的 WSL 通道观测轮（c11）

执行：2026-09-19，env-provider 工作树。终态：**WSL_OBSERVATION_DONE**（**否定观测 + 根因钉到文件:行**）。
授权与费用：零真实模型调用（loopback 假端点）；无凭据读写。

## 1 起点（阶段 1）

| 项 | 值 |
| --- | --- |
| 门脚本 | `scripts/server-round1/pi-production-chain-gate.py`（与 52 观测轮同一门；`--keep` 保留账本） |
| Worker | `.acceptance-bundle-c11/agent-box-worker`，sha256 `c1e353c89609ab2feed07652…` |
| 账本列 | `server_turns.change_set_object_digest` 存在（schema 9） |
| 接线（代码级一手） | `sidecar.py:412-423` launcher 启动前快照（`workspace.list`，失败降级 None）；`sidecar.py:885+` `_WorkerChannels.workspace_change_set()`；`sidecar_backend.py:475-496` 消费并发布对象、写账本列；Worker `main.rs:331+` op 分派、`main.rs:2285+` `handle_workspace_list`（有界、无符号链接跟随） |
| 直探 Worker op（一手） | 单独起 c11 Worker（`--workspace <dir>`）→ `workspace.list` **OK**（返回 path/size/digest；`truncated` 全零）⇒ **op 与协议没有问题** |

## 2 观测轮（阶段 2）

命令（exit 0）：

```bash
AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap PYTHONPATH=src:plugins/... \
python3 scripts/server-round1/pi-production-chain-gate.py \
  --worker workers/agent-box-worker/.acceptance-bundle-c11/agent-box-worker --keep --json
# → PI_PRODUCTION_CHAIN_GATE_OK，kept=/tmp/agentbox-pi-gate-mkb9aso9
```

账本直查（`server/state/agentbox.sqlite`，只读）：

```sql
select id, state, change_set_object_digest, usage_source from server_turns order by created_at;
-- execution_1831ed9a… | completed | NULL | pi-acp-journal
-- execution_60dea006… | completed | NULL | pi-acp-journal
-- execution_397cb970… | failed    | NULL | NULL      （未知模型拒绝相位）
```

**事实：该轮 3 个 turn 的 `change_set_object_digest` 全为 NULL**——用 54 的账本列拿不到 WSL 通道的变更集。
（G1 ✓：轮次在账本可达、终态明确；G2 ✓：给出的是类型化原因而非"看起来应该能拿到"。）

## 3 根因（阶段 2 的插桩运行，第一手；**不是协议缺口**）

**插桩运行**（只 monkeypatch 运行时，不改 src）：同一条门复跑（`PI_PRODUCTION_CHAIN_GATE_OK`），
捕获到：

```text
PROBE workspace.list OK (0 files)     ← launcher 的启动前快照：请求成功，工作区为空
PROBE workspace.list OK (1 files) ×4  ← 后续相位的 after-listing（那时工作区已有审计文件）
```

**同进程反例探针**（构造真实 `_WorkerChannels`，三态对照）：

| 传入 `workspace_before_snapshot` | 构造后存储 | after-listing 调用数 | `workspace_change_set()` |
| --- | --- | --- | --- |
| `{}`（合法的空工作区快照） | **None** | **0** | **None（unknown）** |
| 非空 dict | dict | 1 | 已发布 |
| `None` | None | 0 | None |

**结论（根因）**：`src/agent_box/server/execution/sidecar.py:631-632`

```python
self.workspace_before_snapshot = (
    dict(workspace_before_snapshot) if workspace_before_snapshot else None
)
```

把**空字典**（"工作区此刻为空"这一合法事实）当成"没有快照"，于是 `workspace_change_set()`
（同文件 `:893` 的 `if self.workspace_before_snapshot is None: return None`）**提前返回 None、连
after-listing 都不发**；`sidecar_backend.py:475-496` 随即把账本列写成 NULL。
门的工作区在启动相位正是**空目录**（`pi-production-chain-gate.py:495-496` 只 `mkdir`），
所以**每一轮都必然命中**——这不是偶发，而是"首次轮必 NULL"的确定性行为。
（本地通道的"空改动 ⇒ 不发布"是另一套语义，见 3e945b3；本条只讲 WSL 通道。）

## 4 交回项（069 写权禁止改 src/plugins/tests，故只钉位置与修法）

1. **一行修**：`:631-632` 改真值判断为 `is not None`——`{}` 与 `None` 语义不同（前者=空工作区，后者=没有快照）。
2. **配套测试**：空快照 + 轮内新增文件 ⇒ 变更集应为"全部新增"（当前为 unknown）。
3. 复跑本观测轮应看到 `change_set_object_digest` 非空（对象内容 `added` 至少含审计文件）。
   顺带记录：本门每一轮的 after-listing 都会看到 1 个文件（`AGENTBOX_EGRESS_AUDIT` 写进工作区），
   所以修好后**正例证据不需要会写文件的 harness**——空快照 + 该审计文件即构成真实非空变更集。
4. 54 行的"协议缺口"表述要改：**不再是"Worker 无 workspace 列举 op"**（该 op 已实现并经本单直探验证），
   而是本条的"空快照折叠"——两边都不许写成"已通过"。

## 5 门对照与账

- **G1 轮次真实**：3 个 turn id 在账本可达（2 completed / 1 failed），命令与退出码在 §2 ✓
- **G2 事实分级**：取值=NULL + 类型化根因（file:line）+ 出处（账本列 / 插桩与反例探针）✓；
  未使用"看起来应该能拿到"这类措辞 ✓
- **G3 不改协议**：`git diff --stat -- src plugins` **为空**（本轮未改 src/plugins；插桩仅在运行时内存中）✓
- **账务**：零真实模型调用、零外网（假端点）；临时根 `/tmp/agentbox-pi-gate-*` 由 `--keep` 保留供复核，
  报告与证据落 `docs/server-round1/fullstack/`；证据 JSON：[wsl-change-set-observation-069.json](wsl-change-set-observation-069.json)。