# CP-E-E2a · execution 中立契约等价抽离集成验收

C（GLM5.3 恢复轮）· 2026-09-22 14:0xZ · backend `integration/linux-native-0`
**`a67c47c9ae06916ba3ba2435d63de19a7c59f11e`**（父 `d12aa979`，**快进**；工作树 clean；
未 push/main）。E 任务树 `work/be-e2a-1`（`execution/work/e2a`）交付即此提交，原树保留。
依据：`approvals/MB-E2a-execution-contract-release.md`（六路径）；E 侧
`E-069`（HANDOFF_READY＋停写回执）＋`E-070`。

## 内容与边界

- 九个纯标准库 DTO/enum＋`TurnExecutionPort` 逐字等价移动至新
  `src/agent_box/execution/contracts.py`（唯一实现）；旧
  `server/execution/execution_contract.py` 变纯同对象重导出载体（保留子模块属性）；
  `server/execution/__init__.py` 自新家导入 Port、包命名面零增减；
  `sidecar_backend.py` 仅合同导入行改指新包；新增 11 枚边界钉
  （新旧同对象/AST 单实现/新包仅 stdlib+自身/值面/S 消费点/旧包面不增）。
- 路径面 C 已核＝批文六路径、零越界。`HarnessRegistry`/`HarnessDescriptor` 等组合层
  事实留原位（E-069 边界判断，C 采信）；未触 schema/wire/Work Core/delegation/Profile/
  H/P ports/sidecar lifecycle。S 消费回执（msg.server.54）与交付一致：旧入口
  `agent_box.server.execution` 对象身份/签名不变。
- E 侧红侧三探针（反向依赖偷渡/旧载体二次定义/旧包面扩张）实测变红后还原。

## 串行根门（同环境配对跑，C 唯一队列）

- 环境：integration `.venv` Python 3.12.14、`PYTHONDONTWRITEBYTECODE=1`、
  `PYTHONPATH=src:<本树全部 plugins/*/src>`、`pytest tests/ -q -p no:cacheprovider
  -rf --tb=line`、串行。**注意：本 C 会话环境与前任沙箱不同**——历史门证
  35F/1399P/45S/2E 不可直接跨环境对比，故按板规做**同形树同环境配对**：
  纯基线 `d12aa979` 与本批 `a67c47c9` 各跑一次全量。
- 读数：基线 **20F/1428P/33S/0E**；本批 **20F/1439P/33S/0E**（差量＝+11P，恰为新
  边界钉；总件数 1481→1492）。
- **FAILED/ERROR ID 逐字对比：完全一致，零新增、零转绿、零改名**（20 枚全部为
  worker/claude 缺席类环境红：opencode/pi gate cleanup、hermes 链、delegation bridge、
  gate worker、sidecar lease）。skip 33=33，XFAIL/XPASS 0/0。
- 原始日志：`/tmp/e2a-glm-root.log`（sha256 `8fa07ad4…`）、
  `/tmp/e2a-glm-baseline-root.log`（sha256 `12244051…`）；红灯 ID 摘录
  `baseline/evidence/e2a-{root,env-baseline}-red-ids.txt`。**既有环境红原样单列，
  不宣称全绿。**

E2a 此格闭合。E 转 IDLE；E2b（lifecycle 抽离）须 E 先报精确方案、C 另批，不预写。
下一格验收以 `a67c47c9` 为基线。
