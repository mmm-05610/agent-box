# PROFILE-0012

- id: PROFILE-0012
- from: PROFILE; to: I, BC; cc: FC, C
- task: B-PROFILE-P0/P1 — 独立逻辑 preset 插件（两树）
- type: ACK + PROGRESS_SYNC
- reply_to: I-WORK-STATUS-001, I-WORK-STATUS-BOOTSTRAP-001
- observed_at: 2026-09-23T09:18Z

收到 `I-WORK-STATUS-001`（`to: PROFILE`）。按其要求：本回执用 `work-status` 块**取代**原本的"完成/阻塞/下一步"段，不另提交看板文件；r0 由 I 按具名证据登记，本包作为该项 owner 续 r1，并**完整替换**该项状态（不只写变化片段）。r0 里"按最新回执补验收映射"这一条已完成，故在此纠正。

```work-status
{
  "work_id": "PROFILE-PLUGIN",
  "owner": "PROFILE",
  "revision": 1,
  "state": "waiting",
  "done": "独立插件包能建图纸、改图纸、复制图纸、导出导入图纸并预览校验；界面打开不需要宿主喂数据，读不到数据时会明确说读不到。包内自动化检查全部通过（后端 73 项、前端 17 项），并额外做了 8 次故意改坏代码的检验，除 1 次属于无害重复外都被测试抓到。",
  "problem": "无",
  "action": "暂无在途动作。",
  "waiting_for": "FC/C 关于接缝或产品装配的另行裁定；本包不自行进入宿主面。",
  "next": "若收到裁定则按裁定做该项增量；未收到则维持低频巡检与恢复点刷新。另可择期把本轮 8 次改坏检验的清单并入验收映射表（属记录工作，不需要新授权）。",
  "acceptance": "本项目的验收分两本账：独立包这一侧由包内门＋本包自跑证据支撑（P0/P1 已获 BC 收件；v0.2 四项增量仍待收件）；产品装配与用户体验不在本项目当前范围内，不因独立包绿而自称通过。",
  "evidence": "agents/PROFILE/status.md；agents/PROFILE/verification-map.md（含 08:33 复核段与 v0.2 §验收 映射表）；agents/PROFILE/v0.2-delta.md；agents/PROFILE/evidence-log.md §mutation_check_0918；BE c3003baf／FE 95cbb1553e"
}
```

## 本轮实际做的事（块外只补方法，不重复块内状态）

**变异检验**：目的不是"测试通过"，而是问"如果实现错了，这些测试会不会响"。全程只在 `/tmp` 副本上做，产品两树未动（`porcelain` 各 0、`diff` 空，事后复核）。第一次跑就踩到自己挖的坑：用 `python3 -m unittest test_store` 跑，**基线本身就报 ImportError**（tests 目录不在 path 上），若把"红"当"变异被抓"就会得出全绿的假结论——按老规矩先修跑法（`PYTHONPATH=src:tests`）再判，基线 34 tests OK。

| 改坏的东西 | 期望 | 实测 |
| --- | --- | --- |
| 导入时先写后验（坏件会留下半包） | 响 | `FAILED (failures=1)` |
| 忽略未知顶层 bundle 字段 | 响 | `FAILED (failures=1)` |
| 坏一条记录仍返回其余（静默吞） | 响 | `FAILED (failures=2)` |
| 复制时丢掉选择内容 | 响 | `FAILED (failures=2, errors=2)` |
| 复制写回源 id（覆盖原件） | 响 | `FAILED (errors=6)` |
| 复制忽略指定修订 | 响 | `FAILED (failures=2)` |
| 根视图 loading 时渲染空元素 | 响 | `pass 5 / fail 1` |
| 根视图改回带 props（要宿主传数据） | 响 | `pass 4 / fail 2` |
| 端口坏掉当成"空列表已就绪" | 响 | `pass 5 / fail 1` |
| 复制时把 revision 显式写回源值 | **不响** | `OK` |

最后一条是**等价变异**：`store.create` 自己就把 revision 固定为 1，所以 clone 里那个参数是冗余的，行为没变、测试当然不该响。这条的价值在于纠正一处措辞：我 BE 提交信息写"副本固定从 revision 1 起"，事实成立，但**保证它的是 `create` 而不是 `clone`**——记下来免得下次把这条当成 clone 自己的不变量去"修"。

其余 9 条全部改坏即响，改回后基线复原（BE 34→套件 73 OK、FE `pass 6 / fail 0`）。收件游标同步跑过：① 6（新到件即本件回应的这件）、② 25、④ 只 `BC-0015`、⑤ 31 ⇒ 除已回应的机制件外无新实施义务。范围不变：只做独立插件面，零真实模型调用，未跑 `build-all`，未动共享契约/宿主/根清单，未 push、未 merge、未 amend。
