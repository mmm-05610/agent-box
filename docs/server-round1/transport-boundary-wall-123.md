# 123 — 第三道墙补在 HTTP 边上：现在"裸 500 纯文本"要四道墙全拆才回得来

Tree `agent-box-env-provider`，baseline `bd5d328`（`115` 的收口提交），run 2026-09-19 14:5x–15:1x UTC。
**真实模型调用 0**。来源：`115` 收口报告 §7 的如实交回 ＋ ops 第 118 轮转单。

## 1 前提复核（OF-02，第一步就做）

`115` 说"边界上没有自己的墙"——**在本树一手复现成立**：把 `decode_request` 换成抛 `RuntimeError`
（那就是"信封解析段"，只被 `except WireError` 守着），真 socket 下的出站是

```
500  content-type 'text/plain; charset=utf-8'  len 21  body 'Internal Server Error'
```

⇒ **关键一条**：`115` 的两道墙此时全在位，仍然拦不住它——因为那条路径**不经过** `dispatch`。
这就是为什么"族内在 wire 里闭了"和"这一族闭了"不是一回事，也是本单存在的全部理由。

## 2 加了什么（三处 catch，零重构）

| 位置 | 之前 | 现在 |
| --- | --- | --- |
| wire 路由的 `dispatch` 段 | 只有 `except WireError → 200` | 加 `except Exception → 200 + encode_error(...)`；`internalCode = type(exc).__name__` |
| 应用级 | 只有 `ServerError` / `RequestValidationError` 两个 handler | 加 `@app.exception_handler(Exception)`：**500 保留**，但出站是错误对象；只回异常类型 |
| `/wire/v1/event-stream` 的批次读 | 只接 `(WireError, ServerError)` | 加 `except Exception → close(4400, reason=<类型>)` |

`delegation` 桥已经自己 catch 一切并回类型化 JSON（`:199-205`）⇒ 本单不动它（一字不改既有语义）。
异常**文本**在任何一条新路径上都不进出站体：注入的假路径 `/home/secret-user`、`credential_e08793….dpapi`
在门里被逐条断言"不得出现在响应里"（G2）。

**状态码为什么这样选**：`dispatch` 段用 **200**——同一个崩溃在 `115` 的 dispatch 墙那里就是 200+类型化信封，
"崩在哪一层"不该改变客户端看到的合同；应用级用 **500**——它覆盖的是连信封都解不开/路由都没匹配上的情形，
此时 `request_id` 不可知、也没有 `method` 可回填，把状态说成 200 会是假成功。
这一条是判断不是事实，写在账上供 ops 一行改回（`123` §Notes 允许的就是这个口径）。

## 3 门（`tests/server/test_transport_boundary_wall_123.py`，9 条）

| Gate | 覆盖 | 反例 |
| --- | --- | --- |
| G1 边界兜底 | `test_a_fault_at_the_envelope_boundary_answers_in_json`（500 + JSON + `internalCode:RuntimeError`）· `test_a_fault_inside_the_wire_dispatch_answers_as_a_full_envelope`（200 + 完整信封含 `id`）· `test_a_fault_in_a_plain_rest_route_also_answers_in_json`（REST 面无守卫的路径也吃得到） | `test_counter_example_without_the_wall_the_plain_text_comes_back`：另建一个 app、**在 startup 之前**把 `Exception` 注册摘掉 ⇒ 同样的请求回到 `text/plain` |
| G2 零文本 | `test_no_injected_marker_reaches_any_response`（三个假 marker 逐个断言不在体里）＋ REST 那条也断言一遍 | 把 `str(exc)` 放进 `internalCode` 即红（门里放的就是带路径的文本） |
| G3 既有面不回归 | `test_the_existing_wire_error_paths_are_unchanged`（四条路径的状态码与 family 逐字对表）＋ `test_the_authenticated_face_still_works_after_the_wall` | 任一变化即红 |
| G4 真 wire | `test_the_gate_drives_http_and_not_the_handler`：同一注入另建一个**没有墙**的最小 FastAPI ⇒ 仍是 `text/plain`，证明门测的是本应用的注册 | 改成直调 handler 就比不出这个差 |

## 4 本单一手撞到的两件事，都不是产品问题

1. **"摘掉运行中 app 的 handler"不是反例。** 第一版把 `app.exception_handlers.pop(Exception)` 用在已 start 的 app 上，
   门**仍然绿**——因为 Starlette 在 startup 时就把 handler 解析进了中间件栈。这条"反例"什么都没证。
   现在改成 startup 之前摘（另建实例），并配一条"每个 `create_app` 都带着这道墙"的正向断言。
2. **`115` 的一条反例被本单改判**（`tests/**` 在 123 写面内）：它原来断言"把 `115` 两道墙都退掉 ⇒ 裸 500 纯文本回来"。
   现在退掉那两道墙，wire 路由上那道会接住 ⇒ **200 + 类型化拒绝**，只是 `internalCode` 从域码退化成异常类型。
   所以那条门改成断言这个新事实（并明确"裸 500 的反例现在住在边界上，见 123 的门"）——
   **不是为了让门绿**：`115` 自己的收敛仍被单独钉着（`internalCode == UNHEARD_OF` 那条一旦退化，123 改判后的门就红）。

⇒ 这一族现在有**四道**墙：`converge_family` · `dispatch` · wire 路由 · 应用级。要凑出 QA-008 那个形状，四道得一起拆。

## 5 边界之外还有没有别的宿主？（DoD 第 4 项要的那句如实结论）

有，两类，本单不越界：
- **REST 面上的 `ServerError`** 由既有 handler 翻成类型化 JSON；非 `ServerError` 由本单的应用级墙接住 ⇒ 这一类闭合。
- **还在 ASGI 层之外的**：`create_app` 之外的进程级出口（uvicorn 自己的异常处理、`lifespan` 启动失败、
  静态/健康检查路径）。这些不是"某个请求的错误体"，本单不假称闭合；如实写：**"每一次请求的错误出站"已闭合，
  "进程级失败"不在本单射程**（那属部署/runbook）。

## 6 计数与终态

```
AGENT_BOX_SANDBOX_MODULE=... PYTHONPATH=src:<六个插件 src> python3 -m pytest tests/server -q
→ 1 failed / 805 passed / 1 skipped in 315.90 s        # 那 1 红 = 103 的生成账过期（本单新门多 3 条证据行）
同环境定向复跑 tests/server/test_wire_drive_coverage_103.py + 123 + 115
→ 33 passed in 12.61 s（重新生成 wire-drive-coverage.md 之后：64 行、证据 328 条、单源 44 条）
```

**Worker 工件：在**（`.acceptance-bundle-c9…c12` ＋ `target/{debug,release}`；`QA-007` 口径要求写明）。
全量 `tests/` 的批末计数在 `status.md`，标 **待 QA 复算**（`R-0040 ⑥`）。
DoD 四项齐 ⇒ 终态 **`TRANSPORT_BOUNDARY_WALL_DONE`**。
