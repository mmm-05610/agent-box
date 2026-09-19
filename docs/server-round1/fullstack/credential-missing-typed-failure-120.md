# Work Order 120 — 缺凭据不许崩成 KeyError / 不许只剩 EXECUTION_FAILED（主路径）

终态：**`CREDENTIAL_MISSING_TYPED_FAILURE_DONE`**（runtime 射程；转录"自由文本消息"那半受 wire
reason 字段=code 约束，见 §边界）。§Spend：0 真调用 / ¥0。

## 一手复现（A 的 T6 现场，本树复核）

`MemorySecretStore.read` 原为裸 `self.values[locator]`（`storage/secrets.py:159`）：一条 provider/profile
引用的 credentialId 在本机 store 里没有对应 locator（真实根上 10 条记录仅 1 条被种进内存，其余 9＝Windows
DPAPI id，Linux 读不到）⇒ `KeyError('credential_e0879…dpapi')` ⇒ 传到 `sidecar_backend._safe_code`
（`str(KeyError)` 不匹配 `[A-Z][A-Z0-9_]` code 正则）⇒ 记 "execution failed without a typed code" ⇒
转录 `execution.state:failed, reason:EXECUTION_FAILED`（无原因、无动作）。本树同一码路径逐字复核一致。

## 修法（三处一起；全在 dispatch 之前）

1. **store 读缺 locator ⇒ 类型化**：新增 `SecretLocatorUnavailable`（`code="CREDENTIAL_NOT_AVAILABLE"`，
   消息**只点名 locator 这个不敏感 id** + 结构原因，**零凭据内容**）；`MemorySecretStore.read` 捕获
   `KeyError` 抛它（present 键仍返回 bytes）。
2. **port_factory 凭据解析 ⇒ 类型化、且在 capability_gate/spawn 之前**（`bootstrap/runtime.py`）：
   `secret_store.read(...)` 包 try，任何读失败 ⇒ 记一条 `credential <id> unavailable`（id，非 value）
   再 `raise RuntimeError("CREDENTIAL_NOT_AVAILABLE")`；`secret_store is None` 仍 `CREDENTIAL_STORE_UNAVAILABLE`（未动）。
3. **转录带因**：`_safe_code` 先读 `.code`（964）⇒ `SecretLocatorUnavailable` 或 port_factory 转出的
   `RuntimeError("CREDENTIAL_NOT_AVAILABLE")` 都以 **`CREDENTIAL_NOT_AVAILABLE`** 进转录，不再是 `EXECUTION_FAILED`。

## 门（`tests/server/test_credential_missing_typed_120.py`，4 条）

| 门 | 断言 | 反例 |
| --- | --- | --- |
| G1 不崩 | store.read 缺键⇒`SecretLocatorUnavailable`（非 KeyError），`.code==CREDENTIAL_NOT_AVAILABLE`，含 locator、**不含** value bytes；present 键仍返回 bytes | 退回 `self.values[loc]`⇒门红（抛裸 KeyError） |
| G2/G3 有因+时机 | `_safe_code(SecretLocatorUnavailable(…))`==`CREDENTIAL_NOT_AVAILABLE`；port_factory 转出码同 | — |
| G2 反例见证 | `_safe_code(KeyError("credential_e0879"))`==`EXECUTION_FAILED`（旧形状的见证，证本单确在改这条） | 若把类型化改回去，此断言变红 |
| G4 不回归 | `test_harness_sidecar` **92 passed/6 skipped**、`test_deployment_credentials` 全绿；`runtime` import OK | — |

定向：`test_credential_missing_typed_120 + test_deployment_credentials` **15 passed**。

## 边界（如实记，不越界）

- 转录 reason 字段是**大写 code**（wire `execution.state` 的既有形状）；本单把 `EXECUTION_FAILED`
  升到具名 `CREDENTIAL_NOT_AVAILABLE`。更长的自由文本"换哪个 profile"属 wire/schema 消息位（A 树 /
  P-单），不在本执行者射程，且守 R-0032⑤"零凭据内容"——可行动细节现落**服务器日志**（只 id）。
- `wire/**` 未动；`MemorySecretStore` 外其它 store（file/DPAPI）读缺键的同类形状，若真机撞到按同法补
  （本单复现面是 memory store 的 trial Server 路径）。
