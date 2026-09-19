# Work Order 088 — Windows 侧读 `wsl.exe` 输出的解码崩溃：观测与修法账

终态：见本树 `status.md` 088 行（`WINDOWS_WSL_DECODE_DONE` / `..._PARTIAL`）。

## 1 症状与真实落点（阶段 1 观测）

试用一手（工单 `Current state`）：Windows Server + WSL Worker，Server 日志
`UnicodeDecodeError: 'utf-8' codec can't decode byte 0xd2 in position 0: invalid continuation byte`，
发生在子进程读取线程 `subprocess._readerthread`；上层表现为"执行无类型化码失败"。

核代码：WSL 插件所有 `wsl.exe` 调用（`connector.py:44 --list --quiet`、`:182` `id -un`）都走
`_run → _decode_windows_output`（`:230`，首提交 `5b71393` 起就在）。该函数**末路**已用
`locale.getpreferredencoding(False), errors="replace"`，所以**纯 code-page（含 `0xd2`）输入其实早已不崩**。
但**两条 UTF-16 猜测没有 try 包**：

| 输入 | 修复前 | 原因 |
| --- | --- | --- |
| `b"U\x00b\x00x"`（奇数长、像 UTF-16LE） | **崩** `UnicodeDecodeError: 'utf-16-le' ... truncated data` | `value[1::2].count(0)` 过阈→直接 `.decode("utf-16-le")`，未捕获 |
| `b"\xff\xfe\x41"`（BOM 后截断） | 视缓冲可崩 | `.decode("utf-16")` 未捕获 |
| `b"\xd2\xee"`（纯 code page） | 早不崩（末路 replace） | — |

⇒ **本单真正要修的**＝让 `_decode_windows_output` 成为**全函数**：任何缓冲都不得抛，最坏产出替换字符。
（`0xd2` 那条一手崩栈是**试用机器上被误判为 UTF-16/截断**的一类，落在未捕获分支上。）

## 2 修法（阶段 2）

`connector.py:_decode_windows_output`：给两条 UTF-16 猜测各套 `try/except UnicodeDecodeError: pass`
落到下一档，最终仍是 code-page `errors="replace"`。改的是**解码与错误边界**，不动协议、不动调用面。

## 3 门（阶段 3，`pytest plugins/agent-box-runtime-wsl` 定向）

`plugins/agent-box-runtime-wsl/tests/test_windows_wsl_decode.py`（全内存、零真实调用、零 Windows 依赖）：

- **G1 不崩 + G2 类型化/非空**：参数化喂入 9 类非 UTF-8 缓冲（`0xd2` 前导/居中、奇数长像 UTF-16LE、
  截断 BOM、杂散 null…）⇒ 全部返回 `str` 且**非空输入得非空文本**（静默空串即失败）。
- **G1/G3 反例**：`test_naive_strict_utf8_crashes_on_code_page`（`b"\xd2\xee".decode("utf-8")` 抛 ⇒ 而解码器活）、
  `test_naive_unwrapped_utf16le_crashes_on_truncated`（`b"U\x00b\x00x".decode("utf-16-le")` 抛 ⇒ 而解码器活）——
  证明那两处守卫是**承重**的；把修法退回未捕获 ⇒ 这两条与 G1 用例即红（门咬）。
- **真实 Windows 形状正例**：`test_utf16_distribution_list_still_parses` +
  `test_distributions_from_real_windows_utf16_list`（monkeypatch `wsl.exe --list --quiet` 返回 UTF-16LE）⇒
  稳健化没牺牲真物解码，`distributions()` 正常出 `Ubuntu/debian`。
- **调用点** `test_run_over_non_utf8_wsl_output_survives`：`WslConnector._run` 喂截断 UTF-16LE ⇒ 不抛。

**Windows 宿主实机复现（DoD 第 3 项）**：本执行环境在 Linux/WSL 内，**不能起 Windows 宿主跑 `wsl.exe`**；
以工单所附一手崩栈（试用真机）＋上述**确定性单测复现同一崩溃类**覆盖该路径，如实登记。

## 4 §Spend / 清理 / 回归

真实模型调用：0；`wsl.exe`：单测全 monkeypatch，未触真进程。插件套件：`21 passed / 29 skipped`
（跳过项为需预置 worker 二进制/bwrap 的真机腿，与本单无关）。清理：无残留。
