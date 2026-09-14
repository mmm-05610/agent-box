# 42-D 运行时工件投影（provider-neutral immutable runtime artifact projection）

日期：2026-09-14。分支 `feature/server-harness-extension-v1`。本阶段只建立 Pi / Hermes / OpenCode
生产封装所需的**共同底座**：把"一个不可变运行时依赖目录"以摘要固定、只读、可审计的方式送进
Worker/bwrap。不接真实模型、不读凭据、不改前端、不实现 OpenCode native envelope。

终态：**RUNTIME_ARTIFACT_PROJECTION_READY**（工件投影底座与真实 Worker+bwrap 门通过）。
`BACKEND_IMPLEMENTATION_READY` **未登记**——三家 Harness 的正式封装与逐家真实门仍未做。

## 1. 合同

一条部署声明（deployment `harnesses[]` 的 `runtimeArtifactMounts`）恰好三个字段：

```json
{"source": "/canonical/wsl/absolute/dir",
 "target": "/runtime/artifacts/<stable-name>",
 "treeDigest": "sha256:<64 hex>"}
```

数据流（每一层只做它有权做的事）：

```text
deployment declaration
  → Server：只做通用 schema 校验并原样透传（不读目录；WSL 路径在 Server 上不存在）
  → WSL connector bootstrap：携带已声明目录的 path/target/treeDigest
  → Worker（WSL 内，权威）：真实目录、非链接、不与 workspace/root 重叠、
     重算 tree digest 并与声明比对；不符即类型化拒绝整个握手
  → bwrap：只对 Worker 已授权的目录执行 --ro-bind 到 /runtime/artifacts/<name>
  → Harness 插件/adapter：由自己的参数/环境引用该路径（本阶段不写任何品牌专有路径）
```

四层硬边界：

- Server / Core / Worker / bwrap 中**没有** Pi/Hermes/OpenCode/Codex 分支；新增代码只认
  `runtimeArtifactMounts` 这一中立字段与 `/runtime/artifacts/` 这一中立命名空间。
- Server 不读树、不判存在性：`_runtime_artifact_declarations()`（`server/bootstrap/runtime.py`）
  只校验形状（canonical 绝对、无 `//`、无 `.`/`..`、无 NUL/控制字符、无 `\`、非 Windows 盘符、
  上限 8 条、source/target 各自唯一、target 必须匹配 `/runtime/artifacts/<stable-name>`、
  digest 必须是 `sha256:<64 小写 hex>`），随后把声明逐字带给 connector。
- Worker 不接受任何"授权目录之外"的目录挂载：`validate_bwrap` 对
  `--ro-bind <src> /runtime/artifacts/…` 要求 (canonical src, target) 与 bootstrap 声明**完全一致**，
  且必须是 `--ro-bind`（`--bind` 直接拒绝），否则 `RUNTIME_ARTIFACT_UNAUTHORIZED`。
- bwrap 编译器（`compile_remote_sidecar_bwrap_argv`）额外拒绝把 workspace、reviewed view 或
  它们的祖先/后代经 artifact 命名空间送入 guest；artifact 目标只能是
  `/runtime/artifacts/<stable-name>`，且 source/target 各自唯一。

显式不变量（对照工作令的禁止项）：

- 未把依赖复制进用户项目 workspace 再借 workspace 授权绕过——artifact 是**宿主侧真实目录**
  直接 ro-bind，不是 view 内副本，也不写入 workspace。
- 未挂载整个 `/home`、整个用户 site-packages、用户真实配置目录或登录态：声明的是**具体目录**，
  且其 tree digest 必须逐字节吻合；同时 Worker 拒绝与 workspace/worker root 重叠或互为祖先的路径。
- 未放宽为任意 host directory mount：Worker 只认已声明+已验摘要的目录，bwrap 只认该目录的
  声明的那个 target 且只读。
- 未修改 Desktop wire-v1（本阶段零前端写入；wire 摘要见 §8）。
- 未绕 Worker/bwrap、未建立模型协议代理。

## 2. tree digest 算法（v1，跨 Python/Rust 可复现）

规范编码（字节精确，不是 JSON 序列化）：

```text
encoding := "agentbox-runtime-artifact-tree-v1\n" || u64be(entry_count) || entry*
entry    := kind_byte || u32be(path_bytes) || path || file_payload?
kind_byte := 'd'（目录）| 'f'（普通文件）
file_payload := u64be(size) || sha256(content)      # 32 原始字节
digest   := "sha256:" || 小写hex(sha256(encoding))
```

- `entry*` 按 `path` 的**无符号字节序升序**排列 → 身份与遍历顺序、创建顺序无关。
- 身份包含：条目集合、每条相对路径、类型、文件 size 与内容摘要。**不含**绝对 root 路径
  （同一棵树换目录不改变身份）、mode/owner/mtime（投影只读，这些不参与身份）。
- 两份实现：Python `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/artifacts.py`
  与 Rust `workers/agent-box-worker/src/artifacts.rs`（`canonical_encoding_bounded` /
  `verify_declared` / `tree_identity`）。两侧都流式读取文件（64 KiB 分块），不把整棵树读进内存。

拒绝规则（全部 fail closed，类型化 code）：

| 规则 | code |
| --- | --- |
| root 不存在 / 非目录 / 是链接 | `RUNTIME_ARTIFACT_ROOT_INVALID` |
| 树内任意 symlink | `RUNTIME_ARTIFACT_ENTRY_INVALID` |
| FIFO / socket / 设备 / 其他特殊文件 | `RUNTIME_ARTIFACT_ENTRY_INVALID` |
| 条目路径非可打印 ASCII（0x21–0x7E + `/`）或含空格 | `RUNTIME_ARTIFACT_PATH_INVALID` |
| 空组件 / `.` / `..` / 绝对或含 `//` | `RUNTIME_ARTIFACT_PATH_INVALID` |
| 路径长度 > 4096 字节 | `RUNTIME_ARTIFACT_PATH_INVALID` |
| 重复路径或 ASCII 大小写冲突 | `RUNTIME_ARTIFACT_PATH_COLLISION` |
| 条目数 > 32768 | `RUNTIME_ARTIFACT_OUTSIDE_BOUNDS` |
| 文件内容总量 > 1 GiB | `RUNTIME_ARTIFACT_OUTSIDE_BOUNDS` |
| 目录 digest 与声明不符 | `RUNTIME_ARTIFACT_DIGEST_MISMATCH` |
| root 与 workspace/worker root 重叠或互为祖先 | `RUNTIME_ARTIFACT_ROOT_OVERLAP` |
| source 或 target 重复 | `RUNTIME_ARTIFACT_DUPLICATE` |
| target 不在 `/runtime/artifacts/<name>` | `RUNTIME_ARTIFACT_TARGET_INVALID` |

硬上限：**条目 32768**（目录与文件共用同一预算，取工作令"32,768 个普通文件"建议值的更严格读法）、
**内容总量 1 GiB**（在哈希该文件之前就按 size 拒绝，不会为超限文件读满 1 GiB）、单路径 4096 字节、
单次 bootstrap 最多 8 棵树。值在两侧都以断言固定（Python `MAX_RUNTIME_ARTIFACT_*`、Rust
`MAX_ENTRIES`/`MAX_BYTES` 测试断言），不会被无意放宽。

**路径字符集是刻意的边界**：只允许可打印 ASCII。这样"大小写/规范化冲突"在身份层面
不可能存在——ASCII 大小写冲突被显式拒绝，Unicode NFC/NFD/casefold 歧义则因不含非 ASCII
而不可能出现。Rust 标准库既无 NFC 也无 casefold，若允许非 ASCII 就只能靠不可复现的近似，
因此选择 fail closed：非 ASCII 路径是**类型化部署错误**（`RUNTIME_ARTIFACT_PATH_INVALID`），
而不是静默不同的身份。实际依赖闭包（npm/pnpm 包目录、Python site-packages）均为 ASCII。

### golden fixture（跨语言一致）

`protocols/worker/golden/runtime-artifact-tree-v1.json` 与 `…-single.json` 记录了
`tree`（逐条目 path/kind/content）、`entries`、`bytes`、`canonical_encoding_hex`、`digest`。
Python 与 Rust 两侧测试都**从 JSON 现场物化**该树，再断言：

- 规范编码 hex 与 fixture **逐字节相同**（比只比 digest 更强的诊断力：任何一侧改了排序、
  长度前缀或字段顺序都会立刻暴露）；
- digest / 条目数 / 字节数一致；fixture 的创建顺序**故意非有序**，因此匹配即证明两侧真的排序。

Rust：`artifacts::tests::golden_fixtures_match_the_python_canonical_encoding`（release 通过）。
Python：`plugins/agent-box-sandbox-bwrap/tests/test_runtime_artifacts.py`。

## 3. Worker control protocol 版本

bootstrap 结构新增 `runtimeArtifacts`（`protocols/worker/v1.schema.json` 已同步，
`protocolVersion` 记为 `const: 3`）。因此**诚实提升**：

- Rust `workers/agent-box-worker/src/protocol.rs`：`PROTOCOL_VERSION: 2 → 3`
- Python `plugins/agent-box-runtime-wsl/src/agent_box_runtime_wsl/client.py`：`PROTOCOL_VERSION: 2 → 3`

双向拒绝（都补了测试，且**不是**静默降级）：

- **新 Worker + 旧客户端**：旧客户端送 `protocolVersion=2`；bootstrap 仍可解码（handshake 必须能
  应答），Worker 比对失败并以 `PROTOCOL_VERSION_UNSUPPORTED: client bootstrap 2 != worker 3`
  大声拒绝。测试：`test_worker_refuses_a_previous_generation_client`、`test_worker_rejects_unsupported_protocol_version_loudly`。
- **新客户端 + 旧 Worker**：用**真实历史二进制**验证，不是桩。
  `workers/agent-box-worker/.acceptance-bundle-c3/agent-box-worker`（r3/r4 证据所用的 v2 Worker，
  测试先断言其 sha256 与 manifest 一致）收到新 bootstrap 时，因其结构体 `deny_unknown_fields`
  在比较版本之前就拒绝 → 进程非零退出、客户端得到带原因的断开
  （`Error: Custom { kind: Other, error: "invalid bootstrap" }`）。即：**v2 Worker 永远无法被交给
  一份运行时工件声明**。测试：`test_current_client_refuses_the_preserved_previous_generation_worker`。

拒绝帧：Worker 在 bootstrap 阶段拒绝时先写一个 `WORKER_ERROR` 帧
（`{"ok":false,"error":{"code":…,"message":…}}`）再退出；客户端把该帧解为类型化 `WorkerError(code, message)`
（`client._refusal`），不再把摘要不符压平成通用断连。Server 侧
（`WslSidecarLauncher.launch`）把该带 code 的失败重抛为 `SidecarError`，使原因**进入持久产品状态**，
见 §5 的拒绝门。

## 4. 交付产物

| 项 | 值 |
| --- | --- |
| 新 acceptance bundle | `workers/agent-box-worker/.acceptance-bundle-c4/`（不在 git，`.gitignore` 已覆盖） |
| c4 release Worker 完整 SHA-256 | `sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6` |
| c4 manifest | `{"schemaVersion":1,"workerVersion":"0.1.0","wireVersion":1,"sha256":"sha256:31e92959…"}`（已校验 binary 实算摘要与 manifest 一致） |
| c2（历史，未覆盖） | `sha256:08e4e057aef068997eb4efaa3717096a4f3fad54fd182a568853d8ed97a803c2` |
| c3（r3/r4 证据，未覆盖） | `sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb` |

由 `scripts/server-round1/build-worker.sh` 从当前源码构建（`cargo build --locked --release`），
c2/c3 **未覆盖、未删除**。**本阶段不运行 Windows r4**：c3 上的 r4 仍是历史有效证据，但新 Worker(c4)
尚未在 Windows 复跑，必须在状态中明确。后续生产 Harness 封装与最终 Windows 门应使用 c4 复验。
此外 Worker 能力声明新增中立条目 `runtime.artifact.mount@3`（handshake 可读，便于后续门判定）。

## 5. 真实 Worker + bwrap 门（无网络、无模型）

命令与退出码（在 Linux/WSL 上直接驱动 release Worker；本机无 `wsl.exe`，connector 以与 Windows
连接器相同的 ABW1 控制帧直接启动该二进制——Windows `wsl.exe` 路径是另行记录的历史证据，本阶段不重跑）：

```text
PYTHONPATH=<src + 全部 plugins/*/src> \
python3 scripts/server-round1/runtime-artifact-gate.py \
        --worker workers/agent-box-worker/.acceptance-bundle-c4/agent-box-worker
→ 退出码 0
```

结果（脱敏 JSON，路径/摘要/计数，无秘密）：

```json
{"gates": {"projection": {"checks": {"guest_path_is_the_declared_target": true, "guest_read_the_projected_dependency": true, "guest_saw_the_whole_tree": true, "guest_write_was_refused": true, "host_tree_unchanged": true, "no_write_left_behind": true}, "declared": "sha256:ad3c489267b394f0b1b6a64af0d6f82a60437db4ce0a2ca4e6f94a22e4d61de1", "facts": {"directory": "/runtime/artifacts/fixture-dep", "entries": ["dep.mjs", "nested", "nested/extra.txt"], "error": null, "value": "runtime-artifact-fixed-value", "writeBlocked": true}}, "refusal": {"checks": {"no_delta_emitted": true, "no_session_invented": true, "turn_failed": true, "typed_reason_recorded": true}, "reasons": ["SidecarError: RUNTIME_ARTIFACT_DIGEST_MISMATCH: runtime artifact tree digest did not match the declaration"]}}, "result": "RUNTIME_ARTIFACT_PROJECTION_GATE_OK", "target": "/runtime/artifacts/fixture-dep", "worker": {"digest": "sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6", "path": "workers/agent-box-worker/.acceptance-bundle-c4/agent-box-worker"}, "worker_left_no_projection": true}
```

链路与判据：

- **门 A（投影）**：部署声明一个真实依赖目录（`dep.mjs` 导出常量 + 嵌套目录 + 子文件），Server 装配
  → connector bootstrap 携带 path/target/treeDigest → Worker 在分布内重算摘要并比对 → bwrap
  `--ro-bind <tree> /runtime/artifacts/fixture-dep` → guest 内以 `/usr/bin/node` 启动的 adapter
  **动态 import 该依赖**并回报导出的固定值 `runtime-artifact-fixed-value`。同时证明：
  guest 看到的是完整树（`dep.mjs`、`nested`、`nested/extra.txt`）、目录就是声明的 target、
  guest 向该目录写入**被内核拒绝**（`writeBlocked=true`）、宿主侧树摘要运行前后不变、
  未留下任何 `guest-write`。
- **门 B（拒绝）**：同一份部署换成与真实树不符的 digest（用**内容不同**的树产生，而不是同一棵树的
  拷贝——digest 是内容派生的，同内容不同路径本就应相同）→ turn 失败、**没有**伪造 native session、
  **没有** delta，且类型化原因进入持久 dispatch 账本：
  `SidecarError: RUNTIME_ARTIFACT_DIGEST_MISMATCH: …`。
- **投影残留**：两个门结束后 Worker 的 `views/`、`secrets/` 都不存在（脚本显式断言）。

同一门在 pytest 内以同一装配存在：`tests/server/test_harness_sidecar.py::
test_release_worker_projects_a_runtime_artifact_tree_through_the_real_chain` 与
`::test_release_worker_refuses_a_runtime_artifact_tree_that_drifted`（可用
`AGENT_BOX_TEST_RELEASE_WORKER=<bundle binary>` 指向 c4，已按该方式复跑通过）。

**本阶段没有任何真实 Harness 或真实模型验证**：fixture 是受控的 ACP 替身，只读/只 import 本地文件，
不发模型请求、不读凭据、不做网络 I/O（bwrap 模板保持既有 network 姿态，本阶段未改，也未新增
`--unshare-net`；"无网络"指 fixture 与门不产生网络流量）。

## 6. 反例矩阵（全部已执行）

Python 定向门（`plugins/agent-box-sandbox-bwrap/tests/test_runtime_artifacts.py` 13 项）：
golden 一致（digest/编码/条目/字节）×2、编码字节精确与排序、身份与创建顺序/root 位置无关、
内容改变/新增/删除/改名/新增空目录各自改变身份、空树与单条目树已定义、root 缺失/普通文件/链接、
内部 symlink（目录链接与文件链接）、FIFO、UNIX socket、ASCII 大小写冲突、非 ASCII 路径、含空格路径、
条目数上限与总量上限（小上限参数化 + 真实 32769 条目 + 真实超 1 GiB 稀疏文件，且后者在哈希前拒绝）、
target 形状（22 个非法/保留目标含 `/workspace`、`/runtime/bin`、`/runtime/view`、`/runtime/secret`、
`/tmp/agentbox-home`、`/tmp/agentbox-sidecar-state`、`/home/...site-packages`）。

Server/bwrap 定向门：

- `test_remote_bwrap.py`：artifact 挂载是 `--dir /runtime/artifacts` + `--ro-bind`（绝无 `--bind`）；
  14 类非法挂载被拒（含 `..`、非法 target、`/runtime/bin`、`/runtime/view`、`/runtime/secret`、
  `/tmp/agentbox-home`、`/workspace`、relative source、把 workspace 或 reviewed view 当 artifact）；
  source/target 重复被拒。
- `test_harness_sidecar.py`：部署形状反例 39 项（`SIDECAR_DEPLOYMENT_INVALID`）；
  artifact 声明与挂载**不匹配**（有挂载无声明 / 有声明无挂载 / source 不符 / target 不符 / 重复）
  被 `SidecarError`/`ValueError` 拒绝，不允许"授权 A 却挂载 B"。
- `test_worker_client.py`（真实 Worker）：摘要漂移、root 为链接、root 与 workspace 重叠、声明重复
  → 握手类型化失败；未验证目录、未声明 target、`/home`、把项目当 artifact、以及把已授权树
  **可写**挂载 → `RUNTIME_ARTIFACT_UNAUTHORIZED`；正常树只读挂载并通过。

既有能力回归（未退化）：`executableMounts`、`projectionFiles`、`stateProjection`、secret 投影与
native-state 双轮 resume 的既存测试全部保持通过（见 §7 的 424 passed 全量）。

## 7. 缺陷核查：sidecar bundle 分块重复上传

工作令指出 `src/agent_box/server/execution/sidecar.py` 的 bundle 上传存在**两个重复嵌套的**
`for offset in range(0, len(content), 32 * 1024):`，导致同一文件分块被重复上传。

**核查结论：该重复在 HEAD `989c9f2` 上不存在。** 证据：

1. 该函数 AST 中 `WslSidecarLauncher.launch` 只有两个 `For` 节点
   （`for path, content in sorted(self.bundle.items())` 与 `for offset in range(...)`），
   即单个 (path, offset) 唯一一次 `view.put`；`git log -S "for offset in range(0, len(content), 32 * 1024)"`
   显示该行自 `72d6258` 引入以来出现次数从未变化（若曾出现两次再改回一次，会命中两个提交）。
2. 先写的行为测试 `test_sidecar_bundle_uploads_every_chunk_offset_exactly_once` 在 HEAD 上**通过**：
   它断言 `view.put` 的 (path, offset) 序列与 `sorted(bundle) × range(0, len, 32768)` **完全相等**
   （无重复、无缺块、有序），并逐块重组内容与原始 bytes 相同。
3. 为证明该测试确有判别力，临时把 `launch` 改成工作令描述的形态（同一文件的分块上传两遍），
   测试立即失败（5 个多余 `view.put`，(path, offset) 序列不再相等），随后**还原**
   （`sha256sum` 与改动前一致：`a90651bd44fa03d2a5d165992e373520fc189e89dadf767958115c1c12c3a68e`）。
   即：反例可复现、守卫有效；但 HEAD 本身没有需要修复的重复上传，故**未做"修复"**，
   也未降低 view digest 或任何完整性断言。该重复形态在别处的近邻（`runtime_wsl/execution.py`
   的同一分块模式）属另一条 codex 传输路径，不参与同一次 view，不构成重复上传。

## 8. 验证命令与结果

```text
python3 -m pytest -q tests plugins/agent-box-harnesses/tests plugins/agent-box-runtime-wsl/tests \
  plugins/agent-box-sandbox-bwrap/tests plugins/agent-box-runtime-local/tests
→ 424 passed, 4 skipped, 0 failed        （PYTHONPATH=src + 全部 plugins/*/src；耗 147s）
   对照 41 记录的同一条命令基线：348 passed / 4 skipped（收集 352）
   本阶段收集 428（+76 项新测试），同一 4 项既有平台/环境条件 skip 未扩大

python3 -m pytest -q tests/server/test_harness_sidecar.py
→ 83 passed                              （含既有 executableMounts/projectionFiles/stateProjection/secret 回归）

node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs
→ tests 25, pass 25, fail 0

node --test scripts/server-round1/model-validation-42d.test.mjs
→ pass 4, fail 0

cargo fmt --check                        → 无差异
cargo test --locked --release            → 10 passed, 0 failed（基线 4 → 新增 golden 一致/反例 6 项）
cargo build --locked --release           → 成功

python3 scripts/server-round1/runtime-artifact-gate.py --worker <c4 bundle binary>
→ 退出码 0；RUNTIME_ARTIFACT_PROJECTION_GATE_OK

git diff --check                          → 干净
python3 -m py_compile <改动 .py>          → 通过
node --check tests/server/fixtures/artifact_probe_acp_peer.mjs → 通过
```

## 9. 前端只读观察（不修改前端）

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1` @ `feature/agentbox-desktop-product`
- checked_at **2026-09-14 14:54:08 +08:00**；observed HEAD
  `6a29fd7043fc2c1af34eb478eaaa08564763c986`（`docs(desktop): record the pending-send recovery ordering fix`，
  提交于 14:39:33 +08:00）；工作树 **clean**（`git status --porcelain` 0 行；上次观察为 b02093ce + 17 dirty）
- 其 status.md：`frontend_implementation=PARTIAL`、`writer_lease=**ACTIVE — Codex frontend goal**`
  （09:20 接管，未释放）、`REAL_FLOW_VERIFIED=否`；其自述 updated_at `15:05 (+08:00)` **晚于**本次
  只读观察时刻 14:54，按只读观察如实记录、仅报告，不修改前端。
- wire 摘要**就地重算未变**：TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` =
  `sha256:11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`，生成工件
  `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json` =
  `sha256:5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`，与锁定值一致 →
  **未重锁、未改合同**。
- 双门判定不变：`BACKEND_IMPLEMENTATION_READY=否`、`DESKTOP_IMPLEMENTATION_READY=否`
  （PARTIAL 且写权未释放）→ 未进入全栈联调，未取得写权，未写前端任何文件。前端施工中不是阻断。

## 10. 模型调用、凭据与费用

- 本阶段**模型调用 0 次、费用增量 ¥0**。累计仍为 **1 次调用 / 12 tokens / <¥0.01**（上限 ¥10）。
  未预留、未充值。
- **未读取任何凭据内容**：本阶段代码路径不触碰 SecretStore→Worker 秘密投影，gate 的 fixture 无凭据
  环境变量，bootstrap/日志/证据只含路径、摘要、计数与字节数（gate 输出中无秘密字段）。
  `credentialEnvironment` 等既有秘密通道未被本阶段新增语义使用。
- `workbench_model_verified_count` 仍为 **0**。

## 11. 已知残余与下一阶段

残余（如实列出，未隐藏）：

1. **TOCTOU 窗口**：目录摘要在 bootstrap 时校验一次；bootstrap 与 spawn 之间若宿主侧目录被替换，
   实际 bind 的是替换后的内容。这与既有的 executable 授权模型一致（同样在 bootstrap 校验），
   本阶段未引入每 attempt 重验（代价是每次 attempt 全树哈希）。声明的工件目录按约定为不可变。
2. `runtimeArtifacts` 上限 8 条、路径字符集限可打印 ASCII（理由见 §2），非 ASCII 依赖目录会被
   类型化拒绝而非静默接受。
3. Windows `wsl.exe` 路径与 Windows r4 **本阶段未复跑**；c4 尚未取得 Windows 平台证据（c3 的 r4 仍是
   历史有效证据）。最终 Windows 门与生产 Harness 封装应使用 c4 复验。
4. bwrap 模板的网络姿态未改（未加 `--unshare-net`）；真实 Harness 需要网络，本阶段 fixture 自身
   不产生网络流量。

下一阶段（**仍是同一底座上的三家分别封装**，本阶段不开始）：

- **Pi**：`@automatalabs/pi-acp` 的 Node 模块目录作为一个 artifact 树声明 + 只读投影，adapter 启动参数
  /环境由 Pi 插件自行引用 `/runtime/artifacts/<name>`。
- **Hermes**：隔离的 Python 包闭包作为 artifact 树（**不**挂用户 site-packages），Hermes 插件的
  `PYTHONPATH` 指向 `/runtime/artifacts/<name>`（启动参数仍属插件层，本阶段不做）。
- **OpenCode**：单文件二进制继续沿用现有 `executableMounts`（**不**为统一而退化它），
  native envelope 单独设计。
- 三家封装后再进入 42-D 逐家真实模型门（授权与预算同一账本）。

本阶段**不登记 `BACKEND_IMPLEMENTATION_READY`**。
