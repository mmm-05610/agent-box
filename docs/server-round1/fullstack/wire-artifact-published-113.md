# 113 — 后端发布自己的 wire 工件、两仓按名字对表、旧副本归位（证据）

工单基线 `4ac8263`；本单在 `89c72b5`（112 的门之后）上执行，A 线队列第 7 张（R-0032 ④ / AQ-0008）。
产物：`scripts/server-round1/wire_artifact.py`、`fullstack/contract/wire-v1.server-inventory.json`、
`fullstack/contract/wire-v1.schema.registered-c4255b31.json`（改名）、`fullstack/generated/README.md`（指针）、
`wire-review.md` 的"工件口径（Order 113）"一节、门 `tests/server/test_wire_artifact_113.py`。

## 1 前提核对：工单点的那份副本**已经不换内容了**——但"无声副本"这个形状还在

| 工单（AUD-B-003 / 调度者一手） | 本单一手复量（`89c72b5`） |
| --- | --- |
| 本树 `fullstack/generated/wire-v1.schema.json` = sha `a1bd52a4…`、**33** 方法、停在 57 号单时代 | **同名文件已是 `c4255b31…`、134 键（64×2）＝当前登记对**——105 收口时把它换掉了（`docs/server-round1/fullstack/generated/`，105 证据 §9） |
| "未来的门把它当当前工件喂给 `AGENT_BOX_WIRE_SCHEMA` ⇒ 只覆盖 33/64 且全绿" | 这条**风险**依旧成立，只是换了成因：文件不再过时，但**没有任何东西保证它不过时**——文件名自称"the artifact"、零消费者、无摘要自证 |

⇒ 所以本单第 4 项**不**是"把 33 改成 64"，而是把"无声"这一半治掉：**文件名里就是它自己的 sha256 前 8 位**
（`wire-v1.schema.registered-c4255b31.json`）＋原位置留一行指针＋门同时钉"内容必须等于登记摘要"和
"名字里的 8 位必须等于内容哈希"。改名前后**字节逐字未变**（`sha256sum` 两次都是 `c4255b31…`）。

**同时纠正本文件 §081 的两处**（那是当时正确、现在过时的记录）：它写"本树副本 `a1bd52a4…`（33 方法）"——
105 之后不再如此；113 本节把现状重写，旧行不删（登记账按时间留痕）。

## 2 后端能证明什么、不能证明什么

`wire_artifact.py` 从**源码 AST** 取三件事：`self._handlers` 的 64 行（方法名 → handler 属性）与
`_PARAM_SHAPES` 的必填/可选名集。它**不**声明 result 形状——后端没有可机读的 result 合同，
于是每一条都写成 `"result": {"declared": false, "authority": "contract"}`。
**为什么宁可显式写"我不知道"**：一个缺键会让"清单里没有 result"看起来像"两边一致"，
那正是本单要根除的形状（沉默被读成同意）。

解析而非 import 的理由与 103 相同，并且**复用 103 的那个解析器**：给它加了
`dispatch_pairs()`（方法 → handler）与 `param_shapes()`，`dispatch_methods()` 改成从同一棵树派生——
**一个仓里两份解析器互相点头不是证据**。103 的 9 条门在重构后仍全绿（见 §5）。

## 3 生成 / 比较 / 门入口三件事（写进 `wire-review.md` 的同一节）

```bash
python3 scripts/server-round1/wire_artifact.py --print-digest      # 确定性：两次同值
python3 scripts/server-round1/wire_artifact.py --write   <inventory path>
python3 scripts/server-round1/wire_artifact.py --check   <inventory path>   # 落后 ⇒ 退出码 1
python3 scripts/server-round1/wire_artifact.py --compare <contract path>    # 有漂移 ⇒ 退出码 1
```

比较只有三条轴：**方法集**、每方法 **required 名集**、**Server 接受而合同未声明的属性名**。
`result` 不比。所有路径**必须显式给出**；`--write/--check/--compare` 对仓外路径**直接退出**
（跨树对表靠对方**送过来的副本**，不靠伸手进别人的树）。
`AGENT_BOX_WIRE_SCHEMA` 仍是**唯一**入口，且 `Wire.call` **没有默认值**——这条也被门钉住（§4 第 12 条）。

## 4 两仓实测：一致的部分与不一致的部分，都点名

`--compare docs/.../wire-v1.schema.registered-c4255b31.json` 的实际输出（可复跑，退出码 1）：

| 轴 | 实测 |
| --- | --- |
| `methodsOnlyInServer` / `methodsOnlyInContract` | `[]` / `[]` ⇒ **64 vs 64，方法集一致** |
| `requiredSetDrift` | `[]` ⇒ 六个方法的必填名集逐字一致（其余 58 个也一致） |
| `optionalNotInContract` | **2 条**：`providerModels.update` 与 `providerModels.probeModels` 的 `provenance`——**Server 接受、合同没声明** |

那 2 条正是 098 §9.2 交回、账上写"交 102 重锁"的同一条漂移。本单**不**动对方的合同（写权不在本树），
因此工单 G4 的"两仓一致"在**摘要轴**上成立（本树副本 == 公告第 58 轮登记的 `c4255b31…`，门里断言字节哈希），
在**内容轴**上如实报**两条具名漂移**给调度者 ⇒ 结论不是"一致"，是"差在哪已经说清了"。

**一腿未做（不写成已做）**：直接对桌面 settings 树的**现物字节**做比对。本树的运行环境把跨树访问拦下
（实测：对 `agent-box-desktop-settings-round1` 的只读 `ls` 被策略拦），因此登记依据是
"公告第 58 轮的登记值 ＋ 本树这份按摘要命名的副本"。换本体的逐字节核对需要调度者或 settings 线跑一次
（命令就是 §3 的 `--compare`，把路径换成它送来的那份）。

## 5 门（16 条）与反例真跑

`tests/server/test_wire_artifact_113.py` ⇒ **16 条**（与 105/103 的门同跑：**38 passed in 13.48s**）。

| 组 | 钉什么 |
| --- | --- |
| G1 ×4 | 生成两次逐字节同值且 64；**清单方法集 == 活运行时 `_handlers` 键集**；提交的本体 == 现算本体（落后即红）；从清单里删一条 ⇒ 与提交件不再相等（新鲜度门能咬） |
| G1b ×1 | 每条 `result` 都是 `{"declared": false, "authority": "contract"}`——沉默不许被读成同意 |
| G2 ×3 | 旧位置 `generated/wire-v1.schema.json` **不存在**、指针写明权威在 settings 线并带登记摘要前 8 位；副本内容哈希 == 登记 `c4255b31…`；**名字里的 8 位 == 内容哈希**（改名不换哈希/换内容不改名都会红） |
| G3 ×2 | `wire-review.md` 的新一节必须同时含三条命令、`AGENT_BOX_WIRE_SCHEMA` 与"没有默认值"这句话；`test_wire_v1.py` 里**不得**再出现指向某棵树副本的硬路径 |
| G4 ×3 | 对表报告恰为"两条具名漂移、其余轴空"；**把 `provenance` 补进合同副本 ⇒ 报告自动变干净**（证明报告是输入的函数，不是写死的名单）；从合同里删一个方法 ⇒ 按名字报出来 |
| 越界 ×2 | 仓外路径（`../x`、`/tmp/x`）一律 `SystemExit`；方法集/形状未动（64、`server.hello`、`update` 的必填七件字面） |

反例真跑（进程内改常量，不动工作树）：**4 红 + 2 复位绿**——
① 旧位置再放一份无名分副本 ⇒ 红（`an unlabelled copy here is the defect this order fixes`）；
② 把副本内容换成别的字节而名字仍声称 `c4255b31` ⇒ 红（实测假文件哈希前 8 位是 `ea6caae5`）；
③ 从口径一节里删掉 `--print-digest` ⇒ 红（断言消息就是那个词）；
④ 把提交清单换成一个空清单 ⇒ 红（`committed inventory is stale: regenerate with --write`）；
⑤⑥ 两条复位后各自转绿。临时目录已删并核实。

## 6 费用、清理、未做项

* 真实模型 **0 次 / ¥0**；全部门在源码/JSON 上算，无出站、无模型调用。
* 清理：`/tmp` 下只有本次反例跑的临时目录（已删）；工件与脚本全部在仓内。
* **未做项**：① 与桌面树**现物字节**对表（§4 末，环境拦住了跨树读取）；② `provenance` 那两条漂移的**修法**
  （在合同侧补声明 ⇒ 属 102/重锁家族）；③ 081 交回第 4 条"wire-review 缺 57/58/59/65 小节"不在本单射程，
  仍然开着；④ 清单**没有** result 形状——要后端也出 result 合同是另一件事（需要可机读的形状来源）。
