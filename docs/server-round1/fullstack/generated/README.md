# 这个目录不再有工件

**权威在桌面 settings 线**：`types/wire/wire-v1.ts` 与
`contracts/wire-v1/generated/wire-v1.schema.json`（那一棵树才是合同面与工件的写权方）。

本树曾经在这里放一份 `wire-v1.schema.json`。问题不是它旧，而是**它的文件名长得像"当前工件"**：
审阅者 AUD-B-003 量到它停在 57 号单时代（33 个方法，`a1bd52a4…`），而零个消费者——
未来的门一旦把它喂给 `AGENT_BOX_WIRE_SCHEMA`，结论会只覆盖 33/64 且**全绿**。

113（R-0032 ④）之后：

| 东西 | 现在在哪 | 怎么知道它是哪一份 |
| --- | --- | --- |
| 桌面登记的工件**副本**（证据用，非权威） | `../contract/wire-v1.schema.registered-b1eb4762.json` | **文件名里就是它的 sha256 前 8 位**，对不上就是过期 |
| 后端自己的**清单工件**（64 方法：派发表 + 参数形状） | `../contract/wire-v1.server-inventory.json` | `python3 scripts/server-round1/wire_artifact.py --print-digest` 现算 |
| 生成 / 比较 / 门入口参数的口径 | `docs/server-round1/wire-review.md` 的"工件口径（113）"一节 | 一处规则 |

**门禁口径**：任何要校验 schema 的门**必须显式写路径**（`AGENT_BOX_WIRE_SCHEMA=<path>` 或门里的常量路径），
**不得**默认读某棵树里的副本。本目录里以后也不该再出现无标注的工件。
