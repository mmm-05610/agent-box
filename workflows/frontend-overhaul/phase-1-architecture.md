# Phase 1: 架构重构

> 目标：将 1555 行的单文件拆分为模块化目录

---

## task-1.1-extract-theme

### 目标

提取 Theme 类和设计 token 到独立模块。

### 输入

- `gui-redesign.py` 第 62-242 行

### 输出

- `gui/theme.py` — Theme 类（色彩 token）
- `gui/tokens.py` — 非色彩 token（字号、间距、圆角）

### 步骤

1. 创建 `gui/` 目录结构：

```bash
mkdir -p gui/components gui/pages
touch gui/__init__.py gui/components/__init__.py gui/pages/__init__.py
```

2. 创建 `gui/theme.py`：

```python
"""Theme — Slate Indigo color tokens (dark + light)."""
from __future__ import annotations
from typing import Dict
import customtkinter as ctk


class Theme:
    """Color tokens for Slate Indigo theme (dark + light).

    Reference: docs/specs/gui-redesign-p2.md §1.2.
    """

    DARK = {
        "bg": "#0F1115",
        "bg_canvas": "#0A0C10",
        "bg_sidebar": "#14171D",
        "bg_elevated": "#1A1E25",
        "bg_elevated_2": "#22272F",
        "bg_hover": "#262B33",
        "bg_active": "#2E343D",
        "surface": "#1A1E25",
        "surface_overlay": "#22272F",

        "border": "#2A2F38",
        "border_subtle": "#1F232B",
        "border_strong": "#3D4350",
        "border_focus": "#7B6CF6",

        "fg": "#E6E8EC",
        "fg_muted": "#9CA1AC",
        "fg_subtle": "#5C6270",
        "fg_disabled": "#3F4550",
        "fg_inverse": "#0F1115",

        "primary": "#7B6CF6",
        "primary_hover": "#8E7FF9",
        "primary_pressed": "#6E5FE6",
        "primary_subtle": "#2A2547",
        "primary_fg": "#FFFFFF",
        "accent": "#56B6F9",

        "success": "#7FB069",
        "warning": "#E0A458",
        "error": "#E06C75",
        "info": "#56B6F9",

        "success_subtle": "#1F2A1E",
        "warning_subtle": "#2D2418",
        "error_subtle": "#2D1E20",
        "info_subtle": "#19242C",
        "neutral_subtle": "#22272F",

        "status_running": "#7FB069",
        "status_stopped": "#5C6270",
        "status_warning": "#E0A458",
        "status_error": "#E06C75",
    }

    LIGHT = {
        # ... 从 gui-redesign.py 复制
    }

    _current: Dict[str, str] = dict(DARK)

    @classmethod
    def get(cls, key: str) -> str:
        return cls._current[key]

    @classmethod
    def set_mode(cls, mode: str) -> None:
        actual = mode
        if mode == "system":
            actual = ctk.get_appearance_mode().lower()
        cls._current = dict(cls.DARK if actual == "dark" else cls.LIGHT)
        ctk.set_appearance_mode(mode)

    @classmethod
    def current_mode(cls) -> str:
        return ctk.get_appearance_mode().lower()


def C(key: str) -> str:
    """Convenience alias for Theme.get()."""
    return Theme.get(key)
```

3. 创建 `gui/tokens.py`：

```python
"""Design tokens — typography, spacing, radius, sizes."""

# Typography — system fonts only (zero install)
FONT_SANS = ("Segoe UI Variable", 13, "normal")
FONT_SANS_BOLD = ("Segoe UI Variable", 13, "bold")
FONT_DISPLAY = ("Segoe UI Variable", 24, "bold")
FONT_TITLE = ("Segoe UI Variable", 18, "bold")
FONT_SUBTITLE = ("Segoe UI Variable", 14, "bold")
FONT_BOLD = ("Segoe UI Variable", 13, "bold")
FONT_BODY = ("Segoe UI Variable", 13, "normal")
FONT_CAPTION = ("Segoe UI Variable", 12, "normal")
FONT_MICRO = ("Segoe UI Variable", 11, "normal")
FONT_LABEL = ("Segoe UI Variable", 10, "bold")
FONT_ICON_LG = ("Segoe UI Variable", 18, "bold")
FONT_BIG = ("Segoe UI Variable", 28, "bold")
FONT_HUGE = ("Segoe UI Variable", 32, "bold")
FONT_MONO = ("Cascadia Code", 12, "normal")
FONT_MONO_SMALL = ("Cascadia Code", 11, "normal")
FONT_MONO_LARGE = ("Cascadia Code", 13, "normal")

# Spacing scale (4px grid)
SPACE_XS = 4
SPACE_SM = 8
SPACE_MD = 12
SPACE_LG = 16
SPACE_XL = 24
SPACE_2XL = 32
SPACE_3XL = 48

# Radius scale
RADIUS_SM = 4
RADIUS_MD = 6
RADIUS_LG = 8
RADIUS_XL = 12
RADIUS_FULL = 9999

# Component sizes
SIDEBAR_WIDTH = 220
ROW_HEIGHT = 40
BUTTON_HEIGHT = 32
BUTTON_HEIGHT_LG = 40
INPUT_HEIGHT = 32
```

4. 更新 `gui/__init__.py`：

```python
"""agent-box GUI package."""
from .theme import Theme, C
from .tokens import *

__all__ = ["Theme", "C"]
```

### 验证

```bash
python -c "from gui.theme import Theme, C; print('Theme OK')"
python -c "from gui.tokens import *; print('Tokens OK')"
```

---

## task-1.2-extract-wsl-state

### 目标

提取 WSL 集成和 SQLite 操作到独立模块。

### 输入

- `gui-redesign.py` 第 245-410 行（WSL 集成 + SQLite）

### 输出

- `gui/wsl.py` — WSL 集成（fetch_profiles, launch, path conversion）
- `gui/state.py` — SQLite 操作（SessionDB）

### 步骤

1. 创建 `gui/wsl.py`：

```python
"""WSL integration — fetch profiles, launch, path conversion."""
from __future__ import annotations
import json
import shutil
import subprocess
from typing import Dict, List, Optional, Tuple

AGENT_ORDER: Tuple[str, ...] = ("cc", "codex", "hermes", "opencode")

RESUME_ARGS: Dict[str, Optional[Tuple[str, ...]]] = {
    "cc": ("--continue",),
    "codex": ("resume", "--last"),
    "hermes": ("-c",),
    "opencode": None,
}

MODE_NEW = "新会话"
MODE_RESUME = "继续上次"
LAUNCH_MODES = (MODE_NEW, MODE_RESUME)


def fetch_profiles() -> List[Dict[str, str]]:
    """Return profiles from wsl.exe agent-box list --json."""
    wsl = shutil.which("wsl.exe")
    if wsl is None:
        raise RuntimeError("wsl.exe not found in PATH (install WSL).")
    try:
        proc = subprocess.run(
            [wsl, "bash", "-lc", "agent-box list --json"],
            capture_output=True, text=True, timeout=15, cwd="C:\\",
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("wsl.exe agent-box list --json timed out") from exc
    except OSError as exc:
        raise RuntimeError(f"failed to invoke wsl.exe: {exc}") from exc

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise RuntimeError(
            f"agent-box list failed (exit {proc.returncode}): {stderr or '<no stderr>'}"
        )
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from agent-box list: {exc}") from exc
    if not isinstance(data, list):
        raise RuntimeError("agent-box list --json did not return a JSON array")
    return data


def build_launch_argv(name: str, agent_type: str, mode: str, cwd: str = "") -> List[str]:
    """Build the argv passed to subprocess.Popen to launch a profile."""
    argv: List[str] = ["agent-box", "launch", name]
    if mode == MODE_RESUME and agent_type in RESUME_ARGS:
        extra = RESUME_ARGS[agent_type]
        if extra:
            argv.extend(extra)
    cmdline = " ".join(_shell_quote(a) for a in argv)
    setup = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"'
    if cwd:
        setup = f"cd {_shell_quote(cwd)} && {setup}"
    script = f"{setup} && {cmdline} || {{ ec=$?; echo; echo agent-box failed code $ec; read -p Enter...; }}"
    return ["wsl.exe", "bash", "-lc", script]


def launch_profile(name: str, agent_type: str, mode: str, cwd: str = "") -> None:
    """Launch a profile via wsl.exe."""
    argv = build_launch_argv(name, agent_type, mode, cwd)
    try:
        subprocess.Popen(argv, creationflags=subprocess.CREATE_NEW_CONSOLE)
    except OSError as exc:
        raise RuntimeError(f"failed to launch wsl.exe: {exc}") from exc


def _to_wsl_path(windows_path: str) -> str:
    """Convert a Windows path to WSL path."""
    # ... 从 gui-redesign.py 复制
    pass


def _shell_quote(s: str) -> str:
    """Quote a string for shell."""
    # ... 从 gui-redesign.py 复制
    pass
```

2. 创建 `gui/state.py`：

```python
"""Session state — SQLite operations."""
from __future__ import annotations
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

DB_PATH = Path.home() / ".agent-box" / "sessions.db"


class SessionDB:
    """Thread-safe SQLite session database."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._conn = sqlite3.connect(
                    str(DB_PATH), check_same_thread=False
                )
                cls._instance._conn.row_factory = sqlite3.Row
                cls._instance._conn.execute("PRAGMA journal_mode=WAL")
                cls._instance._init_tables()
            return cls._instance

    def _init_tables(self):
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile TEXT NOT NULL,
                agent_type TEXT NOT NULL,
                mode TEXT NOT NULL,
                cwd TEXT,
                pid INTEGER,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                exit_code INTEGER
            )
        """)
        self._conn.commit()

    def execute(self, sql: str, params: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, params)

    def fetchall(self, sql: str, params: tuple = ()) -> List[Dict]:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]

    def commit(self):
        with self._lock:
            self._conn.commit()


def init_db():
    """Initialize database tables."""
    SessionDB()


def record_launch(profile: str, agent_type: str, mode: str,
                  cwd: str, pid: int) -> int:
    """Record a profile launch."""
    db = SessionDB()
    cursor = db.execute(
        "INSERT INTO sessions (profile, agent_type, mode, cwd, pid, started_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (profile, agent_type, mode, cwd, pid, datetime.now().isoformat())
    )
    db.commit()
    return cursor.lastrowid


def record_exit(pid: int, exit_code: int):
    """Record a profile exit."""
    db = SessionDB()
    db.execute(
        "UPDATE sessions SET ended_at = ?, exit_code = ? WHERE pid = ? AND ended_at IS NULL",
        (datetime.now().isoformat(), exit_code, pid)
    )
    db.commit()


def fetch_sessions(active_only: bool = False, limit: int = 50) -> List[Dict]:
    """Fetch session history."""
    db = SessionDB()
    if active_only:
        return db.fetchall(
            "SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC",
        )
    return db.fetchall(
        "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?",
        (limit,)
    )
```

### 验证

```bash
python -c "from gui.wsl import fetch_profiles, launch_profile; print('WSL OK')"
python -c "from gui.state import SessionDB, fetch_sessions; print('State OK')"
```

---

## task-1.3-extract-components

### 目标

提取组件到 `gui/components/` 目录。

### 输入

- `gui-redesign.py` 第 414-696 行（StatusPill, Badge, Divider, Toast, Sidebar）

### 输出

- `gui/components/status.py` — StatusPill, Badge
- `gui/components/toast.py` — ToastManager
- `gui/components/divider.py` — Divider
- `gui/components/sidebar.py` — Sidebar

### 步骤

1. 创建 `gui/components/status.py`：

```python
"""Status indicators — StatusPill, Badge."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *


class StatusPill(ctk.CTkFrame):
    """Color-coded pill with glyph + label."""

    STATES = {
        "running": ("●", "Running", "status_running", "success_subtle"),
        "stopped": ("○", "Stopped", "status_stopped", "neutral_subtle"),
        "warning": ("⚠", "Warning", "status_warning", "warning_subtle"),
        "error": ("✕", "Error", "status_error", "error_subtle"),
        "info": ("ℹ", "Info", "info", "info_subtle"),
    }

    def __init__(self, master, status: str = "stopped", size: str = "md", **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self._size = size

        glyph, label, fg_key, bg_key = self.STATES.get(status, self.STATES["stopped"])

        self._pill = ctk.CTkFrame(
            self, fg_color=C(bg_key), corner_radius=RADIUS_FULL,
            height=24 if size == "sm" else 28,
        )
        self._pill.pack(fill="x")

        self._dot = ctk.CTkLabel(
            self._pill, text=glyph, text_color=C(fg_key),
            font=FONT_CAPTION if size == "sm" else FONT_BODY,
        )
        self._dot.pack(side="left", padx=(8, 4), pady=4)

        self._lbl = ctk.CTkLabel(
            self._pill, text=label, text_color=C(fg_key),
            font=FONT_CAPTION if size == "sm" else FONT_BODY,
        )
        self._lbl.pack(side="left", padx=(0, 8), pady=4)

    def set_status(self, status: str):
        glyph, label, fg_key, bg_key = self.STATES.get(status, self.STATES["stopped"])
        self._pill.configure(fg_color=C(bg_key))
        self._dot.configure(text=glyph, text_color=C(fg_key))
        self._lbl.configure(text=label, text_color=C(fg_key))


class Badge(ctk.CTkLabel):
    """Uppercase label with color variants."""

    VARIANTS = {
        "neutral": ("fg_muted", "neutral_subtle"),
        "primary": ("primary", "primary_subtle"),
        "success": ("success", "success_subtle"),
        "warning": ("warning", "warning_subtle"),
        "error": ("error", "error_subtle"),
        "info": ("info", "info_subtle"),
    }

    def __init__(self, master, text: str, variant: str = "neutral", **kwargs):
        fg_key, bg_key = self.VARIANTS.get(variant, self.VARIANTS["neutral"])
        super().__init__(
            master, text=text.upper(),
            text_color=C(fg_key), fg_color=C(bg_key),
            font=FONT_LABEL, corner_radius=RADIUS_SM,
            **kwargs,
        )
```

2. 创建 `gui/components/toast.py`：

```python
"""Toast notification system."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *


class ToastManager:
    """Stacked toast notifications (bottom-right)."""

    def __init__(self, root):
        self._root = root
        self._toasts: list = []

    def show(self, message: str, kind: str = "info", duration: int = 3000):
        toast = ctk.CTkFrame(
            self._root, fg_color=C("bg_elevated"),
            corner_radius=RADIUS_LG, border_width=1, border_color=C("border"),
        )
        # ... 实现 toast 显示逻辑
        pass
```

3. 创建 `gui/components/sidebar.py`：

```python
"""Sidebar navigation."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *
from gui.components.status import StatusPill


class Sidebar(ctk.CTkFrame):
    """Left navigation rail (220px wide)."""

    NAV_ITEMS = [
        ("home", "Home", "⌂"),
        ("profiles", "Profiles", "◉"),
        ("sessions", "Sessions", "◈"),
        ("settings", "Settings", "⚙"),
        ("help", "Help", "?"),
    ]

    def __init__(self, master, on_nav, on_settings, status_getter):
        super().__init__(master, width=SIDEBAR_WIDTH, fg_color=C("bg_sidebar"), corner_radius=0)
        # ... 从 gui-redesign.py 迁移
        pass
```

### 验证

```bash
python -c "from gui.components.status import StatusPill, Badge; print('Status OK')"
python -c "from gui.components.toast import ToastManager; print('Toast OK')"
python -c "from gui.components.sidebar import Sidebar; print('Sidebar OK')"
```

---

## task-1.4-extract-pages

### 目标

提取页面到 `gui/pages/` 目录。

### 输入

- `gui-redesign.py` 第 703-1405 行（HomePage, ProfilesPage, SessionsPage, SettingsPage, HelpPage）

### 输出

- `gui/pages/home.py` — HomePage
- `gui/pages/profiles.py` — ProfilesPage + ProfileRow
- `gui/pages/sessions.py` — SessionsPage
- `gui/pages/settings.py` — SettingsPage
- `gui/pages/help.py` — HelpPage

### 步骤

每个页面文件结构：

```python
"""Page: [Name]."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import C
from gui.tokens import *
from gui.components.status import StatusPill, Badge
from gui.components.toast import ToastManager


class [Name]Page(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        # ... 从 gui-redesign.py 迁移
```

### 验证

```bash
python -c "from gui.pages.home import HomePage; print('Home OK')"
python -c "from gui.pages.profiles import ProfilesPage; print('Profiles OK')"
python -c "from gui.pages.sessions import SessionsPage; print('Sessions OK')"
python -c "from gui.pages.settings import SettingsPage; print('Settings OK')"
python -c "from gui.pages.help import HelpPage; print('Help OK')"
```

---

## task-1.5-verify-imports

### 目标

验证所有 import 正确，应用正常运行。

### 步骤

1. 创建 `gui/app.py`（主应用）：

```python
"""Agent Box — main application."""
from __future__ import annotations
import customtkinter as ctk
from gui.theme import Theme, C
from gui.tokens import *
from gui.components.sidebar import Sidebar
from gui.components.toast import ToastManager
from gui.pages.home import HomePage
from gui.pages.profiles import ProfilesPage
from gui.pages.sessions import SessionsPage
from gui.pages.settings import SettingsPage
from gui.pages.help import HelpPage
from gui.wsl import fetch_profiles, launch_profile
from gui.state import fetch_sessions


class AgentBoxApp:
    def __init__(self, root: ctk.CTk):
        self.root = root
        self.root.title("Agent Box")
        self.root.geometry("1280x800")
        self.root.minsize(960, 600)
        self.root.configure(fg_color=C("bg_canvas"))
        # ... 从 gui-redesign.py 迁移
```

2. 更新 `gui-redesign.py` 为入口：

```python
"""agent-box Windows Desktop GUI — entry point."""
from gui.theme import Theme
from gui.app import AgentBoxApp
import customtkinter as ctk


def main():
    Theme.set_mode("system")
    ctk.set_default_color_theme("blue")
    root = ctk.CTk()
    try:
        AgentBoxApp(root)
    except Exception:
        import traceback
        traceback.print_exc()
        raise
    root.mainloop()


if __name__ == "__main__":
    main()
```

3. 运行完整验证：

```bash
# 语法检查
python -m py_compile gui/app.py
python -m py_compile gui/theme.py
python -m py_compile gui/tokens.py
python -m py_compile gui/wsl.py
python -m py_compile gui/state.py

# Import 测试
python -c "from gui.app import AgentBoxApp; print('All imports OK')"

# 启动测试（需要 Windows + WSL 环境）
python gui-redesign.py
```

### 成功标准

- 所有 import 无报错
- 应用正常启动
- 5 个页面可正常导航
- Profile 列表正常显示
- Launch 流程正常工作
