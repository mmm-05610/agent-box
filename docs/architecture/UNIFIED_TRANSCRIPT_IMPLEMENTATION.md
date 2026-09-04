# 统一转写存储实施方案 v2（SH-PROFILE+TRANSCRIPT）

> 状态：待用户批准执行
> 版本：v2——根据 ChatGPT 质疑裁决与 phase2 架构发现全面修订
> 铁律：agent-box core（src/agent_box/**）零改动；agent-box-web 零引用

---

## 零、v2 修订要点（相对 v1 的六个修正）

| # | v1 的问题 | v2 修正 |
|---|---|---|
| 1 | 语义重建 native 文件（`import_events()` 反向写入）不可靠 | **删除 `import_events()`**。跨 harness 进入 = context handoff（公开启动接口 + 上下文快照），不伪造 native 文件 |
| 2 | Studio 自建 `{harness}-home` 与 phase2 native_home 双权威冲突 | **删除**。native home 治理归 harnesses 插件（phase2 native_home 体系）；Studio 只存 Ref/游标 |
| 3 | 五家格式解析器放 Studio（越层） | **归 harnesses 插件**（扩展 session codec SPI）；Studio 只消费统一 Observation |
| 4 | native_resume / context_handoff 语义未区分 | **Leg 模型显式化**：Conversation → Legs → Executions → NativeSessionRef；每 Leg 声明 continuation_mode |
| 5 | transcript.jsonl 缺生产约束 | **权威 = studio.db 的 append-only events 表**（seq 主键/幂等键/schema_version/watermark/脱敏/并发锁）；JSONL 降为导出/交换格式 |
| 6 | 写入双路径（send 写一次+结束解析一次） | **单一写入路径**：实时 observation → transcript 表（唯一入口）；native 解码器仅用于启动导入/批式通道/故障补账（带 watermark 防重） |

---

## 一、目标

Studio 拥有统一的 Conversation/Transcript 视图——**单一权威存储**（studio.db
append-only events 表），实时接入（ObservationHub → 表），前端只消费统一事件格式。

跨 harness 的两种接续语义显式区分：

| 模式 | 含义 | 上下文 |
|---|---|---|
| **native_resume** | 同 harness 用原生 locator 恢复原 session | 无损 |
| **context_handoff** | 把统一历史/摘要交给新 harness，创建新 native session | 文本级全量或压缩 |

---

## 二、架构（三层）

```text
┌─ 前端 ──────────────────────────────────────────────────┐
│ UI（绑定条 + 转写渲染 + Profiles 设置）                    │
├─ plugins/agent-box-studio ─────────────────────────────┤
│ Transcript Ingestor（幂等/排序/持久化/脱敏）              │
│ Conversation → Legs → Executions → NativeSessionRef     │
│ continuation_mode: native_resume | context_handoff      │
├─ plugins/agent-box-harnesses（扩展 session SPI）─────────┤
│ SessionDriver × 5（每 harness 一个驱动）                  │
│ SessionCodec × 5（native ⇄ Observation 解码/注入）        │
│ ObservationHub（seq/replay/permission-once）             │
├─ agent-box core（零改动）───────────────────────────────┤
│ Work / Execution / Ref / Registry                        │
└────────────────────────────────────────────────────────┘
```

### 数据流（单一写入路径）

```text
SessionDriver.poll() → ObservationHub → Ingestor（归一化+脱敏+排序）
  → studio.db events 表（权威，追加式）
  → WS 推前端（读模型）
```

native 文件解码器仅在两个场景调用：
1. **启动导入**：会话首次接入 Studio（历史 JSONL → events 表）
2. **故障补账**：events 表损坏或 native 侧有 Studio 未消费的内容

---

## 三、存储设计

### 权威：studio.db `events` 表（追加式）

```sql
CREATE TABLE transcript_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    leg_id TEXT NOT NULL,             -- Conversation → Legs 模型
    execution_id TEXT NOT NULL,
    harness_type TEXT NOT NULL,
    turn_id TEXT,
    part_id TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    event_type TEXT NOT NULL,         -- turn_started / part / turn_completed / error / …
    payload TEXT NOT NULL,            -- JSON（脱敏后）
    idempotency_key TEXT UNIQUE,      -- 防重复导入
    native_watermark TEXT,            -- native 文件偏移/行号（补账去重）
    created_at TEXT NOT NULL
);
CREATE INDEX idx_events_session ON transcript_events(session_id, seq);
```

- **append-only**：无 UPDATE/DELETE（修正以修正事件追加）
- **幂等**：idempotency_key 唯一约束防重复导入
- **watermark**：native 文件读取偏移，故障补账从断点续读
- **脱敏**：写入前过滤 SECRET 匹配字段

### 导出格式：transcript.jsonl（派生，非权威）

按需从 events 表导出，用于：前端转写渲染 / 跨 harness context_handoff / 审计。
schema_version 内嵌，读取端按版本分派解析器。

### NativeSessionRef（Leg 模型的游标）

```python
@dataclass
class NativeSessionRef:
    harness_type: str      # codex / claude / pi / opencode / hermes
    locator: str           # 各家原生的会话标识（thread_id / session_id / 文件路径）
    source_provider: str   # 产出该会话的驱动（codex-app-server / claude-exec / …）
```

存在 SessionStore（studio.db session 表新增列或关联表）——**Studio 不管理
native 文件本身，只存 locator**。native home 归 harnesses 插件的 native_home
体系管理（phase2 已有：installer/receipts/recovery/durable）。

---

## 四、五家 codec 规格（归 harnesses 插件）

每个 harness codec 实现：

```python
class SessionCodec(Protocol):
    harness_type: str

    def decode_native(self, path_or_conn, watermark) -> tuple[Observation, ...]:
        """native 会话文件 → 归一化 Observation（启动导入/故障补账）"""

    def encode_context(self, events: tuple[Observation, ...], target: NativeSessionRef) -> ContextHandoff:
        """统一历史 → 新 harness 的上下文快照（context_handoff 模式的输入）"""

    def resume_locator(self, native_ref: NativeSessionRef) -> ResumeSpec:
        """同 harness 回切的原生续接参数（thread/resume、--resume、--session）"""

    def fidelity_notes(self) -> tuple[str, ...]:
        """损耗声明（审计透明）"""
```

| harness | decode（native→Observation） | encode_context（unified→该 harness） | resume 机制 |
|---|---|---|---|
| codex | rollout JSONL 解析（去重 event_msg/response_item） | **不可行**（加密 reasoning）→ context_handoff：渲染对话脚本注入 prompt | thread/resume |
| claude | projects JSONL 解析（uuid 链线性化） | context_handoff：渲染脚本 | --resume |
| pi | JSONL 解析（≈直读，近无损） | ≈无损渲染 | --session file |
| opencode | SQLite 只读（session→message→part 映射） | context_handoff | run --session |
| hermes | SQLite 只读（sessions/messages 表） | context_handoff（或 sessions export JSONL 对接） | --resume |

**关键约束**：studio **不打开** opencode/hermes 的 SQLite——解码归各自 harness codec（它们是 harnesses 插件的一部分，有权访问自家存储）。

---

## 五、Leg 模型（数据结构）

```python
@dataclass
class Conversation:
    id: str
    project_path: str
    title: str
    legs: list[Leg]          # 有序，时间线

@dataclass
class Leg:
    leg_id: str
    harness_type: str        # 本段执行者
    profile_ref: Ref | None  # 本段使用的 profile
    native_ref: NativeSessionRef | None  # 该 harness 的 native 会话游标
    continuation_mode: Literal["native_resume", "context_handoff", "fresh"]
    executions: list[str]    # work_core Execution id 列表
    started_at: str
    ended_at: str | None
```

切换 harness = 关闭当前 Leg（native_ref 保留供回切）+ 新建 Leg（continuation_mode 由用户/默认策略决定）。

---

## 六、实施切片（修订版）

| 切片 | 内容 | 量 | 前置 |
|---|---|---|---|
| SH-0 | **phase2 合流评估**：session SPI/hub/codec/native_home 从 phase2 合回主仓 harnesses 插件（或确认差异后决定策略） | 0.5-1 天 | 无 |
| SH-1 | codec 骨架：SessionCodec Protocol + 五家 codec 注册 + decode_native（启动导入） | 1 天 | SH-0 |
| SH-2 | ObservationHub → Ingestor → events 表单向写入 + Leg 模型 + SessionStore 扩展 | 1 天 | SH-0 |
| SH-3 | TurnOrchestrator 接入：native_resume 路径（同 harness 回切）+ context_handoff 路径（跨 harness 注入） | 1 天 | SH-2 |
| SH-4 | 转写读取 API + 前端绑定条/转写渲染对齐 + Profiles 设置分区对接 | 0.5 天 | SH-3 |
| SH-5 | 端到端：codex→claude→codex 三轮真实对话 + 断线恢复 + 多客户端 | 0.5 天 | SH-4 |

## 七、验收标准

1. 五家 native 会话文件均可通过 codec 解码为统一 Observation（无损项零损耗、有损项标注）
2. 同 harness 回切走 native resume（无损）；跨 harness 首次启用走 context_handoff（自动或显式）
3. studio.db events 表为唯一权威转写（追加式、幂等、可审计）
4. core 零改动、agent-box-web 零引用
5. 前端绑定条/转写渲染/Profiles 设置全部可用
