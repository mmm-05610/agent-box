# 裁定 · H-037 旧部署资产处置 · C · 2026-09-22 13:02Z（14:4xZ 依 H-043 修正）

引用：`goal-H-037` §2（三通道只读盘点：运行时消费/测试消费/打包收集）＋
`goal-H-043`（删除前复查，推翻两枚 guard 的通道 1 结论）。
本裁定只定方向与归属，不动任何文件；实施一律另批。

## 14:4xZ 修正（H-043 认账采信）

H-037 盘点未覆盖 `scripts/server-round1/`：两枚 guard 在**离线门脚本**有真消费——
`dsh-production-chain-gate.py:793`（dsh guard）与 `qwen-production-chain-gate.py:781`
（跨族指 dsh guard）；offline 默认分支经 `projection_files_override` →
`bootstrap/runtime.py:616-623→:1530` 真读盘，dsh 门 :815-822 的 monkeypatch 只拦
settings、不拦 guard。⇒ 原判"三通道全零消费"对两枚 guard **不成立**；
**H-GUARDS-001 删除微批撤回**（批文作废），选项 (b)（扩 2 条门脚本路径内存注入）
与 (c)（接受 offline 门损坏）均不采——门脚本属 `scripts/server-round1` 遗留线，
其 plugin_root/adapter/driver 全锚旧包根，单独补 guard 注入是对将整体处置的脚本族
做半修，超出本检查点范围。两枚 guard 与 dsh settings.yaml 同等**登记兼容保留**；
其最终处置随 scripts/server-round1 遗留线统一另批（入延期清单）。

| 旧资产 | 盘点结论（H 只读实测） | C 裁定 |
| --- | --- | --- |
| `agent_box_harnesses/deploy/dsh/settings.yaml` | **活投影源**：dsh 新包 `projection_files()` 输出该相对路径，`bootstrap/runtime.py:592` 经 `_sidecar_deployment_file(root=plugin_root)` 读取；plugin_root 语义＝旧包根 | **兼容保留**。在 `baseline/packages/agent-box-harness-dsh.md` 与包依赖图中登记为暂留兼容入口。等价移除须改 `SETTINGS_SOURCE` 指向＋plugin_root 跨包语义＝S 域契约变更，**延期**基线后由 C 另行协调 S 批，H 不自行删、不自行改。 |
| `agent_box_harnesses/deploy/dsh/loopback-guard.cjs` | 三通道全零消费（新包 production 常量零引用；测试全走新包路径；三 pyproject 无 deploy 段） | **原则批准等价移除**，排入 H 完成 kilo 后的微批（或并入 H 下一格合批时点名）；验收＝同环境根门 FAILED/ERROR ID 零新增＋三通道零消费复查记录。本裁定不是删除授权，动文件须批文点名路径。 |
| `agent_box_harnesses/deploy/qwen/loopback-guard.cjs` | 三通道全零消费（qwen 投影恒空、常量零引用、测试走新包路径） | 同上：**原则批准等价移除**，与 dsh guard 同一微批。 |

要点：
- 两枚 guard 的移除是**收敛冗余**，不是边界必需；不阻塞 CP-MODULE-BASELINE（板规：
  兼容入口不追求一次性删除）。
- H-037 §1 认账（旧包 deploy 实为 8 家、非 7 家）已随两份包说明修正归档，本裁定按修正
  后事实作出。
- 三份资产在 kilo 批文（H-KILO-001）"明确不动"清单中再次点名，防止顺手删除。
