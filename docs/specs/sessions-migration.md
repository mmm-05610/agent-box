# Spec: Session tracking 迁移到 CLI

> 状态: ready | 创建: 2026-06-22

## 目标

将会话追踪（启动记录、退出记录、活跃检测、历史查询）从 `gui/state.py`（Windows 侧 SQLite）迁移到 `src/agent_box/sessions.py`（WSL 侧 SQLite）。GUI 通过 `wsl.exe agent-box sessions` 子命令访问。

## 约束

- 数据库路径: `~/.agent-box/sessions.db`（WSL 侧，与 profiles 同目录）
- CLI 接口: 纯 argparse，零新依赖
- GUI: 现有调用点全部改为 `_wsl_check_output("agent-box sessions ...")`
- 向后兼容: 旧的 Windows 侧 sessions.db 不做迁移（v0.4 无生产用户）

## 新建文件

### `src/agent_box/sessions.py`

```python
# 模块职责: SQLite session tracking
# 数据库: ~/.agent-box/sessions.db, WAL mode
# 表结构:
#   CREATE TABLE IF NOT EXISTS sessions (
#       id INTEGER PRIMARY KEY AUTOINCREMENT,
#       profile TEXT NOT NULL,
#       agent_type TEXT NOT NULL,
#       cwd TEXT,
#       mode TEXT,
#       pid INTEGER,
#       launched_at TEXT NOT NULL,
#       exited_at TEXT,
#       exit_code INTEGER
#   )

# 公开 API:
def record_launch(profile, agent_type, cwd, mode, pid) -> int  # 返回 session_id
def record_exit(session_id, exit_code) -> None
def fetch_sessions(active_only=False, limit=50) -> List[Dict]
def latest_cwd_for(profile) -> Optional[str]
def cleanup_stale_sessions() -> int  # os.kill(pid, 0) / Windows ctypes
```

实现要点:

- 用模块级连接 + `threading.Lock`（WSL 侧不需要 `check_same_thread=False`，因为只在 CLI 主线程用）
- `cleanup_stale_sessions` 同时兼容 Linux（`os.kill(pid, 0)`）和 Windows WSL（同上）

## 修改文件

### `src/agent_box/launch.py`

在 `os.execvpe` 前加一行:

```python
from . import sessions
sessions.record_launch(name, agent_type, os.getcwd(), "新会话" if not extra_args else "继续上次", os.getpid())
```

注意: `execvpe` 后 PID 不变（bwrap 替换 agent-box 进程），所以记录的 pid 就是 bwrap 进程的 pid。

### `src/agent_box/cli.py`

新增 `sessions` 子命令:

```
agent-box sessions              # 列出所有 session（表格）
agent-box sessions --json       # JSON 输出
agent-box sessions --active     # 仅活跃 session
agent-box sessions --cleanup    # 清理僵尸 session
agent-box sessions --exit <id> <code>  # 记录退出（供 GUI watcher 调用）
```

实现: `cmd_sessions(args)` 函数，引入 `sessions` 模块。

### `gui/wsl.py`

新增三个薄包装:

```python
def fetch_sessions(active_only: bool = False) -> List[Dict]:
    raw = _wsl_check_output(
        f"agent-box sessions {'--active' if active_only else ''} --json"
    )
    return json.loads(raw)

def sessions_cleanup() -> int:
    out = _wsl_check_output("agent-box sessions --cleanup")
    return int(out)  # CLI 输出清理数量

def sessions_record_exit(session_id: int, exit_code: int) -> None:
    _wsl_check_output(f"agent-box sessions --exit {session_id} {exit_code}")
```

修改 `launch_profile()`:

- 不再调 `record_launch`（CLI 侧自己记）
- watcher 线程退出时调 `sessions_record_exit` 而不是 `record_exit`
- 返回值改为 session_id（从 CLI 命令输出读回）

### `gui/app.py`

启动时:

```python
# 原来
from .state import cleanup_stale_sessions
cleaned = cleanup_stale_sessions()

# 改为
from .wsl import sessions_cleanup
cleaned = sessions_cleanup()
```

`_active_count` 改为调 `fetch_sessions(active_only=True)`。

### `gui/__init__.py`

删掉对 `state` 模块的文档引用。

## 删除文件

### `gui/state.py`

全部逻辑已迁移到 `src/agent_box/sessions.py` + `gui/wsl.py`。

### `scripts/test_singleton_db.py`

旧 `state.py` 的测试，不再适用。如果 `test_sessions.py` 覆盖了并发写入可删。

## 测试

### `tests/test_sessions.py`

- `test_record_launch_and_exit` — 写入 → 读回 → 验证字段
- `test_fetch_active_only` — 活跃过滤
- `test_latest_cwd` — 按 profile 查最近目录
- `test_cleanup_stale` — 伪造 pid → 清理

## 不做的

- 不迁移旧的 Windows 侧 `sessions.db` 数据
- 不处理 `cleanup_stale_sessions` 在 WSL1 上的兼容性（WSL1 不支持某些 proc 操作）
- 不暴露 `sessions` 命令到 README（文档更新是发布前最后一步）
