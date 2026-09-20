# Order 148 — `_dispatch` 吞异常：定档结果（不写一行代码）

Verdict: **`DISPATCH_SWALLOWED_EXCEPTION_PROBED_PARTIAL`**, with a precise decidable
outcome: **两条注入路径都不产生「停在 `accepted` 的静默轮」**，但**唯一可能命中的那条时序窗口
从进程外打不进去** ⇒ 这只否证了"可达"，**没有否证机制本身**（审阅者的机制腿仍成立）。
`needs_validation` 因此保留在**「对象存储损坏/运维面」这一格**，不是整条待定。

## 0 先修正单的行号（`OF-02` 要求第一步自复核）

单/审阅者写的三处行号在**本树 HEAD** 上都漂了（A 树编号）：

| 单里写 | 本树实际 | 内容 |
| --- | --- | --- |
| `wire/handlers.py:2318-2325` | **`handlers.py:1907-1913`** | `_dispatch` 的 `except Exception: pass`（注释原话：失败由执行端口记成 durable 事实） |
| `sidecar_backend.py:255`（try 起点） | **`sidecar_backend.py:267`** | `try: receipt = self.execution_service.dispatch_execution(...)` |
| `:274-278`（`except BaseException` ⇒ `fail_turn`＋release） | **≈`:283-290`**（同一形状，本轮读到的是 `:583-590` 那条 completion 臂） | 兜底确实只在 try 里面 |
| `try` 之外 56 行 8 类可抛 | **`accept()` 内 `:210-262`**，try 之外 | `get_turn_context`／`objects.read`×2（input＋config）／`resolve_all`／`objects.publish`／`create_work`／`create_execution`／`resources.bind`×3 ⇒ **复核成立** |

静态三事实**逐条复核成立**（这是阶段 1 的交付），只是行号要按本树读。

## 1 注入 B — 普通客户端输入（**判死**）

`_override_mapping`（`handlers.py:1915-1919`）在**被吞的 try 之内**求值：
`accept(execution_id, overrides=self._override_mapping(overrides))` ⇒ 一个缺 `value` 的
override 本可在那里抛 `KeyError` 并被整个丢掉。

实测（真服务＋真 HTTP，`sessions.createAndSend`，`overrides=[{"controlId":"model"}]`）：

```
INVALID_REQUEST: each override needs controlId and value
```

**⇒ 到不了 `accept()`**：挡住的那一层＝**wire 参数校验**（`handlers.py` 的请求面校验），
错误**同步回到客户端**。这一条按审阅者自己的口径＝**产品不可达**。

## 2 注入 A2 — 发送前移除 Profile 的 config 对象（**判死**）

`accept()` 是 config 对象的读者（`:214`）。把该对象从内容存储里删掉后再发送：

```
FileNotFoundError: .../objects/sha256/39/392d895f…
```

**⇒ 仍到不了吞异常点**：请求路径自己在**回执之前**就失败，客户端拿到错误而非 202，
**不会留下 `accepted` 孤儿轮**。这一格也被挡住，挡住的那层＝**发送请求自身要读同一对象**。

## 3 注入 A — 回执之后移除 input 对象（**窗口未命中，不作结论**）

设计意图：`input_object_digest` 在 `:212` 被读，若能"先拿 202、后删对象"，抛错就正好落在
try 之外。实测：

```
state_before_injection = "running"     # 注入时 accept() 已经越过 :212
```

**⇒ 本条既非正例也非反证**：`_dispatch` 在派发线程上**立即**执行 `accept()`，从进程外没有
"回执后、`objects.read` 前"这个窗口。要命中它需要**存储侧真损坏**或**并发删除**——那属运维/
损坏面，不是用户输入面。**如实写：未决，且未决的到底是什么，写清楚。**

## 4 结论（G4）与给 ops 的话

- **自然可达（用户输入）**：**否**——B、A2 两条各自被一层挡住，且都**同步报错**给客户端。
- **机制**：**仍然真**（审阅者第 98 轮的直调实跑已证：异常不传出、DEBUG 零输出、无 `fail_turn`）。
- **未决的一格**＝"对象存储在**回执之后**被损坏/删除"能否在真实部署里发生（并发、GC、盘错）。
  这**不是用户能造成的输入面**，也不是本单 `write_paths` 能证的（不许改 `src/**`）。
- **建议**：按**「自然输入面 `rejected`＋损坏面留一行 `needs_validation`」**收口，
  **不要**为这条另开修复单；如果 ops 认为"损坏面也要有终态事实"，那是一条**新的、独立**的单
  （方向审阅者已给：兜底边界前移到 `accept()` 入口，或至少记一条类型化失败事实＋`_LOG.exception`），
  不该挂在 148 名下。
- **`132` 亚型（本单要归的）**：「先落 durable 事实的界线」必须和「吞异常的范围」对齐——
  本单量到的正是这条界线**位置**（`accept()` 内 `:210-262` 在 try 之外），与
  `AUD-B-035`（类型化出口）、`037`（兜底 except 说谎）同族。

## 5 卫生与计数

- **G5 硬约束**：`git status --porcelain -- src/` **空**（本单一个 `src` 字节都没改）。
- 复跑：`python3 docs/server-round1/probes/sim148_dispatch_swallow_boundary.py`
  （真 `build_runtime`＋`TestClient`＋真 HTTP；假 peer，**0 真调用、0 凭据内容**）。
- 校验：`validate_order.py docs/implementation/work-orders/148-*.md --strict` ⇒ `OK`。
- **Worker 工件：不在**（本单纯 in-process＋假 peer，不需工件）。`待 QA 复算`。
