# CP-E-E2b · execution lifecycle 中立协调账等价抽离集成验收

C（GLM5.3 恢复轮）· 2026-09-22 15:0xZ · backend `integration/linux-native-0`
**`92a2d2ba66fc59b4d2e89bf0cea661ff3d7c0f6f`**（父 `321c883c`，**快进**＝E 源提交
`602e8926`＋`9a552b02`（钉修正）的 cherry-pick 同内容；工作树 clean；未 push/main）。
E 任务树 `work/be-e2b-1`（`execution/work/e2b`）交付两提交原样保留。依据：
`approvals/MB-E2b-lifecycle-release.md`（5 路径）＋`decisions/E2b-pin-amendments-ruling.md`
（白名单 5→7）；E 侧 E-075（HANDOFF_READY 五要素＋停写回执）。

## 内容与边界

- `NeutralRunTracker` 单实现（占键/释放/重放、三态 cancel、observe 分类、证据追加，
  两账一锁；port/factory/on_event 全 opaque 逐调用注入）落
  `src/agent_box/execution/lifecycle.py`；`first_run_lock.py` 逐字等价移动——
  **C 独立复核 md5 全等**（`d6667402…`）。
- `sidecar_backend.py` 四方法薄单向委托；`_active/_neutral_runs/_cancel_receipts/_lock`
  ＝tracker 同一账对象别名（非副本）；`_NeutralRun` 同对象模块别名；业务层
  （accept/_start_run/_complete/_retire_run/stop/pid_for）零改动。旧锁路径＝纯四名
  同对象载体。11 枚 lifecycle 新钉＋两钉修正（b5 单写者钉随迁扫两模块＝不变量更强；
  allowlist 补 threading/uuid，仍纯 stdlib）。
- 路径面 C 已核＝7 路径（5＋2 修正，+685/−286 合计）、零越界、树 clean；红侧三探针
  实录（偷渡 server import/账副本/旧载体锁副本）采信。
- delegation.py、sidecar/local_channel/ssh_connector/placement、extensions、schema/wire/
  Work Core/Profile/H/P 零触碰。

## 串行根门（同环境配对，C 唯一队列）

- 环境：与恢复轮各 CP 完全一致。读数：`321c883c` 基线 20F/1454P/33S/0E vs 本批
  **20F/1465P/33S/0E**（差量＝+11P 恰为 lifecycle 新钉；总数 1507→1518）。
- **FAILED/ERROR ID 逐字一致（同一 20 枚环境红）：零新增、零转绿、零改名**；skip 33=33；
  XFAIL/XPASS 0/0。E 侧定向账（95P/1S 环境既存 skip、collect-only 1511/0E）与 C 复核
  一致。
- 原始日志 `/tmp/e2b-glm-root.log`（sha256 `f9627841…`）；摘录
  `baseline/evidence/e2b-root-red-ids.txt`。既有环境红原样单列，不宣称全绿。

E2b 此格闭合（execution 域＝contracts＋lifecycle 两批已立）。E 转 IDLE；
sidecar/local_channel/ssh_connector/placement 等后续文件＝**基线后**逐件会签另批。
