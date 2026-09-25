# CP-S-S2a · service facade 等价抽离集成验收

C（GLM5.3 恢复轮）· 2026-09-22 14:2xZ · backend `integration/linux-native-0`
**`fe59016b91a09c7fbe561dcebe55665e06e320c4`**（父 `a67c47c9`，**快进**＝S 源提交
`a581e30e` 的 cherry-pick 同内容；工作树 clean；未 push/main）。S 任务树
`work/be-s2a-1`（`server/work/s2a`）交付 `a581e30e` 原样保留。依据：
`approvals/MB-S2a-service-facade-release.md`（五路径）；S 侧 `msg.server.55`（HANDOFF_READY
＋停写回执）＋`msg.server.56`（完整消费回执闭合 E2a 契约）。

## 内容与边界

- `ProductService` 逐字等价移至新 `src/agent_box/service/facade.py`——**C 独立复核
  `git show d12aa979:src/agent_box/server/services.py` 与新 `facade.py` `diff` 为空**。
- 旧 `server/services.py`（110→10 行）＝纯同对象薄别名（docstring＋import＋`__all__，
  零 def/class）；`server/bootstrap/runtime.py` 仅组合根导入行改锚；新包入口薄重导出；
  新增 8 枚边界钉（同对象/单实现/旧入口薄形/无装配注册状态/禁反向 import/过渡边声明
  /组合根导入面/构造签名逐参锁定）。
- 路径面 C 已核＝批文五路径（+247/−105）、零越界、树 clean、零 delegation 路径
  （b2 保护令持续有效，S 已报备处置延期）。
- Profile/sessions/wire 零触碰（S2-b/S2-c 另批）；`server.*` 过渡边按批文明示，不宣称
  service 已全拆。

## 串行根门（同环境配对，C 唯一队列）

- 环境：与 CP-E-E2a 完全一致（integration `.venv` 3.12.14、全插件 src、串行）。
- 读数：`a67c47c9` 基线 20F/1439P/33S/0E vs 本批 **20F/1447P/33S/0E**（差量＝+8P
  恰为新钉；总数 1492→1500）。
- **FAILED/ERROR ID 逐字一致（与 e2a 同一 20 枚环境红）：零新增、零转绿、零改名**；
  skip 33=33；XFAIL/XPASS 0/0。原始日志 `/tmp/s2a-glm-root.log`（sha256
  `2238366b…`）；摘录 `baseline/evidence/s2a-root-red-ids.txt`。既有环境红原样单列，
  不宣称全绿。

S2a 此格闭合。S 已 IDLE 候下一批文——**S2-c1（sessions 物理包）批文随本 CP 发布**，
基线 `fe59016b`。S2-b（Profile 家族转换）候 H 侧家族正主先立，另批。
