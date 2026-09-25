# CP-S-S2c1 · sessions 物理包等价抽离集成验收

C（GLM5.3 恢复轮）· 2026-09-22 14:3xZ · backend `integration/linux-native-0`
**`321c883cac8aa0fbb5e83a9ff76802533c20a0a4`**（父 `0c042f54`，**快进**＝S 源提交
`7788ac75` 的 cherry-pick 同内容；工作树 clean；未 push/main）。S 任务树
`work/be-s2c1-1`（`server/work/s2c1`）交付 `7788ac75` 原样保留。依据：
`approvals/MB-S2c1-sessions-package-release.md`（11 路径）；S 侧 `msg.server.58`
（HANDOFF_READY＋停写回执）。

## 内容与边界

- `SessionService`/`SessionRecords`/`QueueRecords` 唯一实现移至新
  `src/agent_box/service/sessions/`——**C 独立复核**：`repository.py`/`queue.py` 与原文件
  `diff` 全空（逐字节）；`service.py` diff 恰 1 行（包内导入改锚）。
- 旧 `server/sessions` 四文件＝M1-P-A① sys.modules 预注册式同对象 shim（P-QWEN-001/
  s2c1 ACK 已认可的既定纪律；保 128/145 子模块属性与 E 身份钉消费面）；零第二实现。
- 改锚恰两处：`persistence.py:13`、`bootstrap/runtime.py:34-35`；`delegation.py`、
  `storage/database.py`、一切 `server_sessions` SQL/DDL、wire/transport/Profile/E/H/P
  零触碰。7 枚新边界钉（同对象链/零 def/禁反向/过渡边精确集合＝七个 `server.*` 共享
  设施/改锚内容锁定/新包类清单）。
- 路径面 C 已核＝批文 11 路径（+2033/−1878）、零越界、树 clean；b2 保护令持续
  （S 报备处置仍延期）。

## 串行根门（同环境配对，C 唯一队列）

- 环境：与 CP-E-E2a/CP-S-S2a/CP-H-KILO 完全一致。读数：`0c042f54` 基线
  20F/1447P/33S/0E vs 本批 **20F/1454P/33S/0E**（差量＝+7P 恰为新钉；总数 1500→1507）。
- **FAILED/ERROR ID 逐字一致（同一 20 枚环境红）：零新增、零转绿、零改名**；skip 33=33；
  XFAIL/XPASS 0/0。S 侧同命令定向对照（94→101 件，唯一固有红
  `test_unavailable_capabilities_carry_a_reason` 两侧同在）与 C 复核一致。
- 原始日志 `/tmp/s2c1-glm-root.log`（sha256 `62fc6f86…`）；摘录
  `baseline/evidence/s2c1-root-red-ids.txt`。既有环境红原样单列，不宣称全绿。

S2c1 此格闭合（service 域＝facade＋sessions 两批已立）。S 候下一批文——**S2-c2（wire
物理包）批文随本 CP 发布**，基线 `321c883c`。S2-b（Profile 家族转换）仍候 H 侧正主。
