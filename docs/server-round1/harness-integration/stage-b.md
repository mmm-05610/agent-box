# Work Order 40-B — Worker 双向实时通道

日期：2026-09-14。状态：B 阶段门通过（真实 Worker 二进制 + bwrap 隔离 fake 子进程，
零凭据零模型）。检查点：本文件随 40-B 提交。

## 协议升级（ABW1 帧格式不变，控制协议 v2）

- `protocol::PROTOCOL_VERSION = 2`：bootstrap 新增 `protocolVersion` 字段；
  worker 校验不匹配即拒绝（错误串含 `PROTOCOL_VERSION_UNSUPPORTED`）；
  客户端校验 HELLO_ACK 的 `protocolVersion==2`，不匹配报
  `HANDSHAKE_VERSION_UNSUPPORTED`。旧客户端/新 worker、新客户端/旧 worker 双向都是
  大声失败，绝无静默降级为一次性语义。capabilities 新增 `spawn.interactive@2`、
  `attempt.write@2`。
- 帧格式（MAGIC/HEADER/digest）与 golden frame 保持不变。

## 新能力（main.rs）

1. `spawn` 参数新增 `interactive: bool`（缺省 false = 原一次性语义逐字节不变）。
   interactive 尝试：stdin 保持开启，初始 `stdinBase64` 可选写入且**不**关闭。
2. `attempt.write`：向存活 interactive 尝试追加 ≤64KiB 的 stdin 块
   （`ATTEMPT_NOT_INTERACTIVE` / `ATTEMPT_NOT_READY` / `ATTEMPT_STDIN_CLOSED` /
   `STDIN_INVALID` 类型化错误）。
3. `stdin.close`：take+drop 子进程 stdin 句柄。tokio 管道无半关闭，EOF 靠关闭 fd
   交付（`shutdown()` 不够——这是实测得出的关键点）。句柄经 `OnceCell` slot 从
   `run_process` 传回 Running 表。
4. `process.output` 预终止事件：stdout/stderr 由 drain 任务按块转发
   （attemptId/generation/stream/seq/data/eof），主 select 循环统一写出。
   转发预算 1 MiB/尝试，超限发一条 `truncated:true` 标记后停止转发；
   最终 result 仍按 MAX_OUTPUT_BYTES 全量记账并给出 digests（背压+限额双保险）。
   terminal EXIT 帧写出前先冲空事件队列，保证"终止前事件先于终止"这一顺序契约。
5. 断连回收：控制 EOF/租约到期/取消 → 既有 cancel + process_group SIGTERM→SIGKILL +
   kill_on_drop 路径不变，对 interactive 尝试同样生效。

## 客户端（agent-box-runtime-wsl）

- `WorkerClient.subscribe_output`：事件在 reader 线程直接派发（此前事件帧会被
  帧队列阻塞到下一次 request 才可见——流式正确性的关键）；
  `write_stdin` / `close_stdin`。
- `WslAttempt.interactive`、`subscribe_output` / `next_output` / `write_stdin` /
  `close_stdin`；非 interactive 尝试调用即 `ATTEMPT_NOT_INTERACTIVE`。

## 验证（plugins/agent-box-runtime-wsl/tests/test_interactive_channel.py，×3 稳定）

```text
test_worker_rejects_unsupported_protocol_version_loudly            PASS
test_interactive_attempt_streams_output_and_takes_stdin_before_terminal PASS
test_interactive_cancel_terminates_the_child_tree                  PASS
test_interactive_output_budget_reports_truncation                  PASS
test_attempt_write_on_one_shot_attempt_is_rejected                 PASS
python3 -m pytest -q plugins/agent-box-runtime-wsl/tests/ → 14 passed（含既有9项）
```

全量受影响门：tests/server + work_core 七件 + extensions + resource_contracts +
plugins_cli + runtime-wsl + harnesses → **154 passed, 4 skipped, 0 failed**。

## 修正一项 38/39 文档记录

`test_capture_failure_blocks_later_turn_and_never_acks` 在基线 b415eb2 与本分支各
3 次重复运行均 PASS：38 记录的该失败为偶发（flaky）而非确定性失败，单次运行结果
不可作判定依据。已在 39 证据与 status 同步更正。

## 对 40-C 的交接

interactive 通道即 Codex/各家长驻适配器的承载面：Worker → bwrap → node sidecar
（NDJSON envelope）→ ACP adapter。40-C 逐家注册、能力矩阵、原生差异证明。
