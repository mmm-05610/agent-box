---
id: 088
slug: windows-wsl-decode
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["plugins/agent-box-runtime-wsl/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0002
terminal: ["WINDOWS_WSL_DECODE_DONE", "WINDOWS_WSL_DECODE_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 088 — 试用抓到的真 bug：Windows 侧 Server 读 `wsl.exe` 输出被非 UTF-8 打挂

## Objective

试用第一轮（Windows 侧 Server + WSL Worker）时，Server 日志出现
`UnicodeDecodeError: 'utf-8' codec can't decode byte 0xd2 in position 0: invalid continuation byte`，
发生在子进程读取线程（`subprocess._readerthread`）。`wsl.exe --list --quiet` 在 Windows 上的输出**不是 UTF-8**
（UTF-16LE / 控制台代码页），按 UTF-8 解码必然失败。本单把它修成**稳健解码**（或**类型化失败**），并加反例测试。

## Current state

- 触发路径：`plugins/agent-box-runtime-wsl/src/agent_box_runtime_wsl/connector.py:44` 的
  `wsl.exe --list --quiet`（以及同文件其余 `wsl.exe` 调用点）
- 症状：读取线程抛 `UnicodeDecodeError`，上层表现为执行无类型化码失败（`execution failed without a typed code`）
- 试用环境：Windows Server 指向 WSL 源；Linux 侧 Server 不走此路径（所以只在 Windows 宿主复现）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `connector.py` 的全部 `wsl.exe` 调用 | 明确编码/错误处理策略：探测（UTF-16LE 与代码页）或 `errors="replace"` + 类型化失败 | 不许崩线程 |
| `tests/**` | 反例：喂入含 `0xD2` 的非 UTF-8 字节，断言不崩且有类型化结果 | 门有牙 |

- 不改协议、不改调用面；只改**解码与错误边界**
- 报告须含：修前崩栈片段（脱敏）、修后同输入的输出、以及"哪些字节序列被判定为什么"

## Requirements

### Requirement: 非 UTF-8 输出不再崩

#### Scenario: 含 0xD2 的输出

**WHEN** 子进程输出包含 `0xD2` 开头或其中的非 UTF-8 字节序列
**THEN** 不抛 `UnicodeDecodeError`；要么解出可读文本（按探测到的编码），要么**类型化失败**并给出字节位置

### Requirement: 有反例测试

#### Scenario: 回归

**WHEN** 跑该插件的测试
**THEN** 存在一条"非 UTF-8 字节"的用例，且它在修复前会失败

## Stages

- [ ] 1. 复现（Windows 宿主）并留崩栈证据（提交）
- [ ] 2. 实现稳健解码/类型化失败（提交）
- [ ] 3. 反例测试 + 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不崩 | 同一输入不再抛 `UnicodeDecodeError` | 修复前的崩栈必须贴进报告 | fail (typed) |
| G2 类型化 | 无法解码时给类型化码与字节位置 | 静默空串即失败 | fail (typed) |
| G3 反例在册 | 存在修复前会失败的用例 | 只测正常输出即失败 | fail (typed) |

## Validation

```bash
python3 -m pytest -q plugins/agent-box-runtime-wsl
git diff --check && git status --short
```

## DoD

1. 实现：解码与错误边界。2. 反例：G1/G2/G3。3. 真实环境：Windows 宿主复现一次。4. 回归：插件套件计数。
5. 账务：零调用。6. 账：本单终态行。

## Acceptance

- 绿：`WINDOWS_WSL_DECODE_DONE`；否则 `WINDOWS_WSL_DECODE_PARTIAL` + 精确剩余（例如 Windows 宿主不可用）
