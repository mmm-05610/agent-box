# Sol 入口核对（R013，人工编排路径）

用户授权："允许按现行 RUNBOOK 的 `sol-reserve` → 实际调用 → 保存原始结果 → `sol-complete`
路径进行人工编排，不恢复退役派发器"，并要求先核对实际命令、预扣、去重与失败计次。
本文件记录核对结果。**未重置预算，未消费额度。**

## 1. 预扣规则（`fn_sol_reserve`，`lib/sol.sh`）

| 规则 | 实际行为 |
| --- | --- |
| 顺序 | **先 `sol-reserve` 再调用**。调用失败也计次（"预留先于调用，失败也计次"） |
| 去重 | 同一 `key`（第 5 列）重复 reserve 直接 `deny:duplicate-candidate-and-question`，**不计次** |
| 上限 | `reserved >= cap(10)` → `deny:budget-exhausted` |
| 末位保留 | `kind != final` 且 `reserved >= cap - final_reserve = 8` → `deny:key-node-floor-reached`。即 key 类调用最多 8 次，2 个额度留给 `final` |
| 记账 | 每次 reserve 追加一行 `seq\|reserved_at\|kind\|reason\|key\|PENDING\|-\|call_id` |
| 不重置 | 跨日/换工具/重启都不重置（RUNBOOK 第 1 条；`sol-init` 在已有记录时会拒绝重建） |

⇒ 因为去重按 `key` 计，**`key` 必须绑定最终候选摘要**，且同一"候选+问题"只 reserve 一次。

## 2. 完成与失败计次（`fn_sol_complete`）

`sol-complete <call_id> ok|bad|error`。拒绝条件：记录不可信、call_id 匹配行数 ≠ 1、该行已关闭。
`ok` / `bad` / `error` 三种终态都**不退还**额度。

## 3. 实际调用命令（照抄退役 `fn_sol_call` 的形态，不恢复其派发器）

```bash
CODEX=/home/maoqh/.local/bin/codex          # 实测存在，codex-cli 0.155.1
MODEL=gpt-5.6-sol                            # env.conf: FE_SOL_MODEL（用户指定，不更换）
timeout --signal=TERM --kill-after=10 1800 \
  "$CODEX" exec -m "$MODEL" -s read-only --ephemeral \
    --skip-git-repo-check --color never \
    -C "$FE_RUN" -o "$FE_RUN/sol/<cid>.reply.md" - < "$FE_RUN/sol/<cid>.request.md"
```

- `-s read-only` + `--ephemeral`：审查者不改盘、不留会话（与退役实现一致）。
- `-o <file>`：只取最后一条消息作为回复工件。
- **工件必须落 `$FE_RUN/sol/<cid>.reply.md`**：`fn_sol_audit` 要求每个预算行都有对应
  reply 工件，而"有工件却无预算行"会被判为**可能绕过**。

## 4. 贯通性结论

- 命令、模型名、二进制、目录、审计要求**均已核对**（见上）。
- **未验证的一点**：`codex exec -m gpt-5.6-sol` 能否真正**服务**一次补全（需要一次真实调用才能
  证明，而真实调用必须先 reserve、失败也计次）。因此"入口可靠贯通"在首次调用前**无法前置证明**。
- 按用户指示："入口无法可靠贯通则记录具体阻塞，其他工作继续"。本次以**一次绑定最终候选摘要的
  关键审阅**来实际验证贯通性；若失败，则记 `bad`/`error`、写明具体 stderr 尾部，
  并把"Sol 独立审阅"标为**阻塞**，其余工作照常推进。

## 5. 现账（未动）

```
cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2; auto-dispatch=off; pending=0
sol-budget.log: 仅表头（从未发生调用）; sol/: 空
```
