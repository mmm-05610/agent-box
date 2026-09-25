# C-RUNTIME@v1 — 资源/运行时 provider 义务契约（C 发布，公共区单写者另批执行）

发布：中央 C · 基线 b067c571 · 提供方 P（`07-ifr05-p-answers.md` §1/§3 源码自证）、消费方 E（`E-D2` #1/#4）、H（增量3 委托文件/终端）。
**性质**：本文件固定**契约版本与语义**；对 `runtime_composition/protocol.py`、`sandbox_port.py` 的**代码改动属公共区**，由 C 指定**单写者**另立逐路径批准执行，P/E/H 不擅改公共出口。动词采用**加性**声明，不改既有签名（O-3/R 复用）。

## 1. Provider 释放/终止动词（P-7：把「缺方法静默跳过」变「类型化义务」）
在 `RuntimeHost` / `Sandbox` / `TerminalSession` 三个 Protocol **加性**声明可选能力 + 方法（能力未声明者，E 按「可产生副作用」保守处理）：
- 能力声明：`composition.compensation@1`（组件是否自证补偿/幂等释放）。
- `RuntimeHost.terminate(op: HostTransportOperation)`：终止经**既有封闭通道** `HostTransport.submit(transport_kind="terminate@1")` 表达（P-1 实测 `protocol.py:384-391` 字段 `transport_kind/sealed_payload/spawn_token` 已足），**不新增进程 SPI**；阶梯语义（Linux killpg TERM→宽限→KILL；Windows Job）归 provider 内部。
- `Sandbox.cleanup(spec)` / `TerminalSession.release(request=None)` / `RuntimeHost.release()`：显式声明，E 不再 `getattr` 鸭子类型猜。
  - **〔加性更正 04:00Z · `CP-INC2-A`/候选 `19dce83`〕**：INC2-A 落地形状钉＝**host 面动词为 `terminate(op)`＋`cleanup(execution_id=None)` 两族两动词、零改名**（E-015 预裁：host=`cleanup` 补注入码；`release` 保持 terminal-family 位、不越名统一——统一 host 动词属边界变化另批另报）；coordinator 补偿段的鸭子派发已替换为静态命名调用（五形状行为恒等表有钉）。

## 2. 释放回执形状（P §3，两侧对接；细节属 provider，E 只判「异常=补偿失败且已记录」）
- 三态释放族（tmux/direct-stdio）：`{"released": bool, "destroyed": bool, "managed": bool}`。
- 清理族（bwrap/git/coordinator 汇总）：`{"status": "cleaned" | "already_cleaned" | {"error": ...}}`。
- **幂等**：已达目标态（worktree/会话/记录皆无）→ no-op（`already_cleaned`/`destroyed:False`），非错误；「无 ownership/marker 但目标仍在」→ **仍拒**（不放宽 D-0010/护栏）。

## 3. P-4 改名消歧（不合并）
- `runtime_composition/protocol.py:394` 跨端口执行投影 `IsolatedProcessSpec`（spawn_token/attempt_key/spec_digest/io_mode/local_argv + 私密 carrier_argv）——**公共名不动**。
- `sandbox_port.py:131` provider 内部「最终 argv+environment 对」**降为局部名 `RoomProcessSpec`**（把 provider 私有 env 面挡在冻结类型外）。单写者：P 提案、C 指定执行者改公共区，消费者随之更新引用。
  - **〔加性更正 04:00Z · `CP-INC2-A`〕**：实际落形＝`RoomProcessSpec` 正名＋**`IsolatedProcessSpec` 模块内兼容别名（`__all__` 登记、退役另批）**——re-export/fake/bwrap/tests-integration 全部引用面**字节不动**（E-015 预裁；「消费者随之更新引用」改判为「按各自批文渐进迁移」，两同名类**不合并**反锁有钉）。

## 4. entrypoint / room（P-3）
- room entrypoint 由 provider 声明；`sandbox_port.py:127` 公共区「便利默认」去留随本契约发布处理（bwrap 内固定模板强校验 `provider.py:245-246` 保持，插件内字面量副本由 P-T2 D8b 收敛）。

## 5. 失败/兼容/反例
- 兼容：加性，公开 Wire 不动；既有 `release/cleanup` 调用方行为不变。
- 零副作用承诺：**分级**（P-5）——目标进程零创建成立；provider 自有登记不原子（D6/D7 由 P-T2 插件内自补偿修复）→ E **不建**失败登记路径。
- 反例：不声明动词→E 生产链上端口后仍鸭子类型（把 P-7 缺口搬进生产链，故**先发动词、再 E-INC2**）；合并两 `IsolatedProcessSpec`→泄露 provider 私有 env，破坏「秘密/原始路径关在 provider 内」护栏。

## 6. 门与次序（C 记录）
  - **〔加性更正 04:00Z〕步骤②成账**：C-RUNTIME 发布✓→**单写者公共区批（INC2-A `19dce83`，protocol/sandbox_port/coordinator）✓**→E-INC2 生产链上端口＝a-3 confluence 在途→H 增量3 候执行面。
1. **本契约发布**（版本 C-RUNTIME@v1）→ 2. C 指定单写者对 `protocol.py`/`sandbox_port.py` 做**加性**编辑并逐路径批 → 3. **E-INC2** 生产链接线（撤 windows 直 import 的删除门）→ 4. **H 增量3** 委托文件/终端用本契约执行面 → 5. S R1 stopReason 生效门另需 `C-HARNESS@v1`（H↔E 定稿后发）。
- 关联：P-2/D4/D5「home/明文留存」不在此（属 IFR-01，交 I）。ssh（P-6）属新插件/格局，另行 C 排期。
